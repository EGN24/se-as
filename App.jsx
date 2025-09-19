// --- COMIENZO DEL FRONTEND ---
// Este archivo contiene toda la lógica y la interfaz de usuario que se ejecuta en el navegador del cliente.

import React, { useState, useEffect, useRef } from 'react';
import { Camera, Play, BookOpen, ChevronRight, Pause, RefreshCw, X, CheckCircle, Clock, ChartLine, Hourglass, Plus, PlusCircle, ChevronDown, Redo2, Home, Frown, Sparkles, Save } from 'lucide-react';
// Estos scripts se cargan desde un CDN para habilitar la librería de seguimiento de manos.
// Estas son dependencias externas para MediaPipe Hands y TensorFlow.js.
const SCRIPT_HANDS = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands';
const SCRIPT_TFJS = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs';
const SCRIPT_HANDS_DRAWING = 'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils';
const SCRIPT_HANDS_SOLUTIONS = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands';

const App = () => {
  // State hooks para manejar el estado de la aplicación y la UI.
  const [view, setView] = useState('main');
  const [isTraining, setIsTraining] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [correctGestures, setCorrectGestures] = useState(0);
  const [totalGestures, setTotalGestures] = useState(0);
  const [currentCourse, setCurrentCourse] = useState(null);
  const [showCreateModelModal, setShowCreateModelModal] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraError, setCameraError] = useState(null);
  const [modelName, setModelName] = useState('');
  const [modelType, setModelType] = useState('Movimiento Libre');
  const [gesturesToTrain, setGesturesToTrain] = useState(['']);
  const [currentGesture, setCurrentGesture] = useState('Simulado...');
  const [isHandDetected, setIsHandDetected] = useState(false);
  const [gestureFeedback, setGestureFeedback] = useState(null);
  
  // Progreso de los gestos, sin guardar en la base de datos
  const [gesturesProgress, setGesturesProgress] = useState({
    A: 0, E: 0, I: 0, O: 0, U: 0
  });

  // Variables para el seguimiento de manos y la detección
  const handsRef = useRef(null);
  const drawingUtilsRef = useRef(null);
  const animationFrameIdRef = useRef(null);
  const noHandTimerIdRef = useRef(null);
  const lastDetectionTimeRef = useRef(Date.now());
  const recognitionCooldown = 2000; // 2 segundos de enfriamiento para detectar un nuevo gesto
  const GESTURES_GOAL = 20; // Objetivo de gestos para completar un curso.

  // Gestos simulados para los cursos
  const gestures = {
    A: {
      instruction: 'Cierra los dedos y muestra el pulgar.',
    },
    E: {
      instruction: 'Dobla los dedos y junta con el meñique.',
    },
    I: {
      instruction: 'Cierra los dedos excepto al meñique.',
    },
    O: {
      instruction: 'Forma un círculo con todos los dedos.',
    },
    U: {
      instruction: 'Levanta el índice y el meñique.',
    }
  };


  // Configurar la cámara y el seguimiento de manos
  useEffect(() => {
    const setupCameraAndHands = async () => {
      if (isTraining && !isPaused) {
        setCameraError(null);
        try {
          if (window.Hands && window.drawConnectors && window.drawLandmarks) {
            handsRef.current = new window.Hands({
              locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
              }
            });
            handsRef.current.setOptions({
              maxNumHands: 1,
              modelComplexity: 1,
              minDetectionConfidence: 0.5,
              minTrackingConfidence: 0.5
            });
            handsRef.current.onResults(onResults);
            drawingUtilsRef.current = window;
          }

          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();

            if (handsRef.current) {
              const detectHands = async () => {
                if (!videoRef.current || !videoRef.current.videoWidth || !videoRef.current.videoHeight || !isTraining || isPaused) {
                    animationFrameIdRef.current = requestAnimationFrame(detectHands);
                    return;
                }
                
                await handsRef.current.send({ image: videoRef.current });
                
                animationFrameIdRef.current = requestAnimationFrame(detectHands);
              };
              detectHands();
            }
          }
        } catch (err) {
          console.error("Error al acceder a la cámara:", err);
          setCameraError("No se pudo acceder a la cámara. Por favor, asegúrate de haber dado permiso.");
        }
      }
    };

    const loadScripts = async () => {
      const existingScriptTags = Array.from(document.querySelectorAll('script'));
      const scriptUrls = [SCRIPT_TFJS, SCRIPT_HANDS_DRAWING, SCRIPT_HANDS_SOLUTIONS];
      const scriptsToLoad = scriptUrls.filter(url => !existingScriptTags.some(tag => tag.src === url));

      if (scriptsToLoad.length > 0) {
        await Promise.all(scriptsToLoad.map(url => {
          return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = () => resolve();
            document.body.appendChild(script);
          });
        }));
      }
      setupCameraAndHands();
    };

    if (isTraining && !isPaused) {
      loadScripts();
    }

    return () => {
      if (animationFrameIdRef.current) {
          cancelAnimationFrame(animationFrameIdRef.current);
          animationFrameIdRef.current = null;
      }
      if (noHandTimerIdRef.current) {
          clearTimeout(noHandTimerIdRef.current);
          noHandTimerIdRef.current = null;
      }
      
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
      
      if (handsRef.current) {
        handsRef.current.close();
        handsRef.current = null;
      }
    };
  }, [isTraining, isPaused]);
  
  const onResults = (results) => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvasCtx = canvasRef.current.getContext('2d');
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);

    const handDetected = !!(results.multiHandLandmarks && results.multiHandLandmarks.length > 0);
    setIsHandDetected(handDetected);
    
    const now = Date.now();
    const detectionDelay = 6000;
    if (now - lastDetectionTimeRef.current < detectionDelay) {
        if (handDetected) {
            for (const landmarks of results.multiHandLandmarks) {
                drawingUtilsRef.current.drawConnectors(canvasCtx, landmarks, drawingUtilsRef.current.HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
                drawingUtilsRef.current.drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', lineWidth: 2 });
            }
        }
        canvasCtx.restore();
        return;
    }
    lastDetectionTimeRef.current = now;

    if (handDetected) {
      if (noHandTimerIdRef.current) {
        clearTimeout(noHandTimerIdRef.current);
        noHandTimerIdRef.current = null;
      }

      if (now - lastDetectionTimeRef.current > recognitionCooldown) {
        setCorrectGestures(prevCorrect => {
          const newCorrect = prevCorrect + 1;
          const finalCorrect = Math.min(newCorrect, GESTURES_GOAL);
          
          if (finalCorrect >= GESTURES_GOAL) {
            handleStopTraining(true);
          }
          
          return finalCorrect;
        });
        
        setTotalGestures(prevTotal => prevTotal + 1);
        setGestureFeedback('¡Gesto correcto!');
        setTimeout(() => setGestureFeedback(null), 2000);
        setCurrentGesture(`Gesto en proceso...`);
      }

      for (const landmarks of results.multiHandLandmarks) {
        drawingUtilsRef.current.drawConnectors(canvasCtx, landmarks, drawingUtilsRef.current.HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
        drawingUtilsRef.current.drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', lineWidth: 2 });
      }
    } else {
      if (!noHandTimerIdRef.current) {
        noHandTimerIdRef.current = setTimeout(() => {
          handleStopTraining(false);
        }, 3000);
      }
      setCurrentGesture('Mano no detectada');
    }
    canvasCtx.restore();
  };

  const handleStartTraining = async (course = null) => {
    if (course) {
      setCurrentCourse(course);
      
      setCorrectGestures(gesturesProgress[course] || 0);
      setTotalGestures(0);
      setView('training');
      setIsTraining(true);
      setIsPaused(false);
    } else {
      setView('course_selection');
    }
  };

  const handleStopTraining = (isSuccess) => {
    setIsTraining(false);
    setIsPaused(false);
    
    if (isSuccess) {
      if (currentCourse) {
        setGesturesProgress(prev => ({
          ...prev,
          [currentCourse]: correctGestures,
        }));
      }
      setView('training_complete');
    } else {
      setView('training_failed');
    }
  };

  const handleGoBack = () => {
    setView('main');
    setIsTraining(false);
    setIsPaused(false);
    setCorrectGestures(0);
    setTotalGestures(0);
    setCurrentCourse(null);
  };
  
  const handleRetry = () => {
    setCorrectGestures(0);
    setTotalGestures(0);
    setIsTraining(true);
    setIsPaused(false);
    setView('training');
  };

  const handleCreateModelSubmit = (e) => {
      e.preventDefault();
      console.log('Modelo Creado:', { modelName, modelType, gesturesToTrain });
      setShowCreateModelModal(false);
      setModelName('');
      setGesturesToTrain(['']);
  };

  const handleAddGestureField = () => {
    setGesturesToTrain([...gesturesToTrain, '']);
  };

  const handleGestureInputChange = (e, index) => {
    const newGestures = [...gesturesToTrain];
    newGestures[index] = e.target.value;
    setGesturesToTrain(newGestures);
  };

  const renderView = () => {
    switch (view) {
      case 'main':
        return (
          <div className="min-h-screen flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-100 font-inter">
            <header className="w-full max-w-7xl flex justify-between items-center py-4">
              <h1 className="text-3xl font-bold text-gray-800">Aprende Lenguaje de Señas con IA</h1>
              <nav className="space-x-4 hidden sm:block">
                <a href="#" className="text-gray-600 hover:text-gray-800">Inicio</a>
                <a href="#" className="text-gray-600 hover:text-gray-800">Cursos</a>
                <a href="#" className="text-gray-600 hover:text-gray-800">Entrenar</a>
                <a href="#" className="text-gray-600 hover:text-gray-800">Progreso</a>
              </nav>
            </header>

            <section className="text-center my-12">
              <h2 className="text-4xl font-extrabold text-gray-900 mb-2">¡Aprende Lenguaje de Señas con IA!</h2>
              <p className="text-gray-500">Utiliza la inteligencia artificial para comenzar a aprender el lenguaje de señas.</p>
              <button onClick={() => handleStartTraining()} className="mt-6 px-8 py-3 bg-purple-600 text-white rounded-lg shadow-md hover:bg-purple-700 transition duration-150">
                Comenzar Entrenamiento
              </button>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-7xl mt-8">
              <div className="bg-white p-6 rounded-xl shadow-lg text-center flex flex-col items-center">
                <div className="text-purple-600 mb-4">
                  <Camera size={40} strokeWidth={2} />
                </div>
                <h3 className="font-semibold text-lg text-gray-800">Detección en Tiempo Real</h3>
                <p className="text-sm text-gray-500 mt-2">Utiliza tu cámara web para detectar y reconocer gestos de lenguaje de señas instantáneamente.</p>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-lg text-center flex flex-col items-center">
                <div className="text-purple-600 mb-4">
                  <Sparkles size={40} strokeWidth={2} />
                </div>
                <h3 className="font-semibold text-lg text-gray-800">IA Avanzada</h3>
                <p className="text-sm text-gray-500 mt-2">Modelo de machine learning entrenado con TensorFlow.js y MediaPipe para máxima precisión.</p>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-lg text-center flex flex-col items-center">
                <div className="text-purple-600 mb-4">
                  <BookOpen size={40} strokeWidth={2} />
                </div>
                <h3 className="font-semibold text-lg text-gray-800">Aprendizaje Interactivo</h3>
                <p className="text-sm text-gray-500 mt-2">Cursos estructurados con retroalimentación inmediata para acelerar tu aprendizaje.</p>
              </div>
            </section>

            <section className="w-full max-w-7xl mt-12">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Tu Progreso</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl shadow-lg flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm text-gray-500">Completados</span>
                    <span className="text-2xl font-semibold text-gray-800">0</span>
                  </div>
                  <CheckCircle className="text-green-500" size={32} />
                </div>
                <div className="bg-white p-4 rounded-xl shadow-lg flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm text-gray-500">En Progreso</span>
                    <span className="text-2xl font-semibold text-gray-800">0</span>
                  </div>
                  <Clock className="text-blue-500" size={32} />
                </div>
                <div className="bg-white p-4 rounded-xl shadow-lg flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm text-gray-500">Progreso Total</span>
                    <span className="text-2xl font-semibold text-gray-800">0%</span>
                  </div>
                  <ChartLine className="text-purple-500" size={32} />
                </div>
                <div className="bg-white p-4 rounded-xl shadow-lg flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm text-gray-500">Tiempo Estimado</span>
                    <span className="text-2xl font-semibold text-gray-800">10h</span>
                    <span className="text-xs text-gray-400">restante</span>
                  </div>
                  <Hourglass className="text-orange-500" size={32} />
                </div>
              </div>
            </section>

            <section className="w-full max-w-7xl mt-12">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Cursos de Entrenamiento</h2>
              <div id="course-cards" className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {Object.keys(gestures).map(key => (
                  <div
                    key={key}
                    onClick={() => handleStartTraining(key)}
                    className="bg-purple-600 text-white p-4 rounded-xl shadow-lg flex flex-col items-center text-center cursor-pointer hover:bg-purple-700 transition duration-150"
                  >
                    <div className="flex justify-between items-center w-full">
                      <span className="text-2xl font-bold">{key}</span>
                      <Play className="text-white hover:text-gray-200" size={32} />
                    </div>
                    <p className="text-xs mt-2">{gestures[key].instruction}</p>
                    <div className="w-full mt-2">
                      <div className="bg-white bg-opacity-30 h-1 rounded-full">
                        <div className="bg-white h-1 rounded-full" style={{ width: `${(gesturesProgress[key] / GESTURES_GOAL) * 100}%` }}></div>
                      </div>
                      <span className="text-xs font-semibold mt-1">Progreso: {gesturesProgress[key]}/{GESTURES_GOAL}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col items-center mt-12 py-12 border-2 border-dashed border-gray-300 rounded-xl">
                <Plus size={48} className="text-gray-400 mb-4" />
                <p className="text-gray-500 mb-4">No tienes modelos personalizados</p>
                <p className="text-gray-500 mb-6 text-center">Crea tu primer modelo personalizado para entrenar gestos específicos</p>
                <button onClick={() => setShowCreateModelModal(true)} className="px-6 py-3 bg-purple-600 text-white rounded-lg shadow-md hover:bg-purple-700 transition duration-150">
                  Crear Mi Primer Modelo
                </button>
              </div>
            </section>
          </div>
        );

      case 'course_selection':
        return (
          <div className="min-h-screen flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-100 font-inter">
            <header className="w-full max-w-7xl flex justify-between items-center py-4">
              <h1 className="text-3xl font-bold text-gray-800">Aprende Lenguaje de Señas con IA</h1>
              <nav className="space-x-4 hidden sm:block">
                <a href="#" className="text-gray-600 hover:text-gray-800">Inicio</a>
                <a href="#" className="text-gray-600 hover:text-gray-800">Cursos</a>
                <a href="#" className="text-gray-600 hover:text-gray-800">Entrenar</a>
                <a href="#" className="text-gray-600 hover:text-gray-800">Progreso</a>
              </nav>
            </header>
            <section className="w-full max-w-7xl mt-8">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">Área de Entrenamiento</h2>
                  <p className="text-gray-500 text-sm">Crea y entrena modelos personalizados de reconocimiento de gestos</p>
                </div>
                <div className="flex items-center space-x-2">
                  <button onClick={handleGoBack} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg shadow-md hover:bg-gray-300 transition duration-150 ease-in-out">
                    Volver al Inicio
                  </button>
                  <button onClick={() => setShowCreateModelModal(true)} className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg shadow-md hover:bg-purple-700 transition duration-150 ease-in-out">
                    <Plus size={16} className="mr-2" />
                    Crear Modelo
                  </button>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Cursos Básicos</h3>
              <div id="course-cards" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {Object.keys(gestures).map(key => (
                  <div
                    key={key}
                    onClick={() => handleStartTraining(key)}
                    className="bg-purple-600 text-white p-4 rounded-xl shadow-lg flex flex-col items-center text-center cursor-pointer hover:bg-purple-700 transition duration-150"
                  >
                    <div className="flex justify-between items-center w-full">
                      <span className="text-2xl font-bold">{key}</span>
                      <Play className="text-white hover:text-gray-200" size={32} />
                    </div>
                    <p className="text-xs mt-2">{gestures[key].instruction}</p>
                    <div className="w-full mt-2">
                      <div className="bg-white bg-opacity-30 h-1 rounded-full">
                        <div className="bg-white h-1 rounded-full" style={{ width: `${(gesturesProgress[key] / GESTURES_GOAL) * 100}%` }}></div>
                      </div>
                      <span className="text-xs font-semibold mt-1">Progreso: {gesturesProgress[key]}/{GESTURES_GOAL}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col items-center mt-12 py-12 border-2 border-dashed border-gray-300 rounded-xl">
                <Plus size={48} className="text-gray-400 mb-4" />
                <p className="text-gray-500 mb-4">No tienes modelos personalizados</p>
                <p className="text-gray-500 mb-6 text-center">Crea tu primer modelo personalizado para entrenar gestos específicos</p>
                <button onClick={() => setShowCreateModelModal(true)} className="px-6 py-3 bg-purple-600 text-white rounded-lg shadow-md hover:bg-purple-700 transition duration-150">
                  Crear Mi Primer Modelo
                </button>
              </div>
            </section>
          </div>
        );

      case 'training':
        const noDetectedGestures = totalGestures - correctGestures;
        const progressPercentage = totalGestures > 0 ? Math.round((correctGestures / GESTURES_GOAL) * 100) : 0;
        return (
          <div className="min-h-screen flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-100">
            <div className="w-full max-w-3xl bg-white p-8 rounded-xl shadow-lg relative">
              <button onClick={() => handleStopTraining(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 focus:outline-none">
                <X size={24} />
              </button>
              <h2 className="text-2xl font-semibold text-gray-800 mb-6">Entrenar - <span id="course-title">{currentCourse ? `Vocal ${currentCourse}` : 'General'}</span></h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center mb-6">
                <div className="bg-purple-200 p-4 rounded-lg">
                  <p className="text-3xl font-bold text-purple-800">{totalGestures}</p>
                  <p className="text-sm text-purple-600">Total</p>
                </div>
                <div className="bg-green-200 p-4 rounded-lg">
                  <p className="text-3xl font-bold text-green-800">{correctGestures}</p>
                  <p className="text-sm text-green-600">Correctos</p>
                </div>
                <div className="bg-blue-200 p-4 rounded-lg">
                  <p className="text-3xl font-bold text-blue-800">{progressPercentage}%</p>
                  <p className="text-sm text-blue-600">Progreso</p>
                </div>
                <div className="bg-red-200 p-4 rounded-lg">
                  <p className="text-3xl font-bold text-red-800">{noDetectedGestures}</p>
                  <p className="text-sm text-red-600">No detectados</p>
                </div>
              </div>
              <div className="w-full mb-6">
                <div className="flex justify-center space-x-4">
                  <button onClick={() => setIsPaused(!isPaused)} className="px-4 py-2 bg-yellow-500 text-white rounded-lg shadow-md hover:bg-yellow-600 transition duration-150">
                    {isPaused ? <Play size={24} /> : <Pause size={24} />}
                  </button>
                  <button onClick={() => handleStopTraining(false)} className="px-4 py-2 bg-red-500 text-white rounded-lg shadow-md hover:bg-red-600 transition duration-150">
                    <X size={24} />
                  </button>
                </div>
              </div>
              <div className="bg-gray-800 aspect-video rounded-xl flex items-center justify-center relative overflow-hidden">
                {cameraError ? (
                  <span className="text-white text-center p-4">{cameraError}</span>
                ) : (
                  <>
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover"></video>
                    <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full"></canvas>
                    <div className="absolute top-2 left-2 px-2 py-1 bg-red-500 text-white text-xs rounded-full">EN VIVO</div>
                    {gestureFeedback && (
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 p-4 bg-green-500 text-white rounded-lg shadow-lg flex items-center space-x-2 animate-bounce">
                            <CheckCircle size={24} />
                            <span>{gestureFeedback}</span>
                        </div>
                    )}
                  </>
                )}
              </div>
              <div className="mt-4 flex justify-between items-center text-sm text-gray-600">
                <p>Gesto detectado: <span className={`font-bold ${currentGesture.includes('Gesto en proceso') ? 'text-purple-600' : 'text-red-600'}`}>
                  {isHandDetected ? currentGesture : 'Mano no detectada'}
                </span></p>
                <div className="flex items-center">
                    <p className="mr-2">Confianza:</p>
                    <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-300 ${isHandDetected ? 'bg-green-500' : 'bg-red-500'}`}
                            style={{ width: `${isHandDetected ? '100%' : '0%'}` }}
                        ></div>
                    </div>
                    <span className={`ml-2 font-bold ${isHandDetected ? 'text-green-600' : 'text-red-600'}`}>
                        {isHandDetected ? 'Alta' : 'Baja'}
                    </span>
                </div>
              </div>
              <p className="text-sm text-gray-600">Objetivo: <span className="text-gray-800">{currentCourse ? gestures[currentCourse].instruction : 'Realizar gestos aleatorios.'}</span></p>
            </div>
          </div>
        );

      case 'training_complete':
        const finalPrecision = totalGestures > 0 ? Math.round((correctGestures / totalGestures) * 100) : 0;
        return (
          <div className="min-h-screen flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-100 text-center">
            <div className="w-full max-w-3xl bg-white p-8 rounded-xl shadow-lg relative">
              <div className="flex flex-col items-center space-y-4">
                <CheckCircle size={80} className="text-green-500" />
                <h2 className="text-3xl font-bold text-gray-800">¡Entrenamiento Completado!</h2>
                <p className="text-gray-600">
                  Has completado el entrenamiento con {correctGestures} gestos correctos y una precisión del {finalPrecision}%.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full mt-6">
                  <div className="bg-purple-200 p-4 rounded-lg">
                    <p className="text-3xl font-bold text-purple-800">{totalGestures}</p>
                    <p className="text-sm text-purple-600">Total Detectados</p>
                  </div>
                  <div className="bg-green-200 p-4 rounded-lg">
                    <p className="text-3xl font-bold text-green-800">{correctGestures}</p>
                    <p className="text-sm text-green-600">Correctos</p>
                  </div>
                  <div className="bg-blue-200 p-4 rounded-lg">
                    <p className="text-3xl font-bold text-blue-800">{finalPrecision}%</p>
                    <p className="text-sm text-blue-600">Precisión</p>
                  </div>
                  <div className="bg-red-200 p-4 rounded-lg">
                    <p className="text-3xl font-bold text-red-800">{totalGestures - correctGestures}</p>
                    <p className="text-sm text-red-600">Incorrectos</p>
                  </div>
                </div>
                <div className="flex space-x-4 mt-6">
                  <button
                    onClick={handleRetry}
                    className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg shadow-md hover:bg-gray-300 transition duration-150 ease-in-out flex items-center"
                  >
                    <Redo2 size={20} className="mr-2" />
                    Entrenar de Nuevo
                  </button>
                  <button
                    onClick={handleGoBack}
                    className="px-6 py-3 bg-purple-600 text-white rounded-lg shadow-md hover:bg-purple-700 transition duration-150 ease-in-out flex items-center"
                  >
                    <Home size={20} className="mr-2" />
                    Volver al Inicio
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      case 'training_failed':
        return (
          <div className="min-h-screen flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-100 text-center">
            <div className="w-full max-w-xl bg-white p-8 rounded-xl shadow-lg relative">
              <div className="flex flex-col items-center space-y-4">
                <Frown size={80} className="text-red-500" />
                <h2 className="text-3xl font-bold text-gray-800">Entrenamiento Finalizado</h2>
                <p className="text-gray-600">
                  El entrenamiento ha terminado. No se pudo detectar una mano o el objetivo no se alcanzó.
                </p>
                <div className="flex space-x-4 mt-6">
                  <button
                    onClick={handleRetry}
                    className="px-6 py-3 bg-red-600 text-white rounded-lg shadow-md hover:bg-red-700 transition duration-150 ease-in-out flex items-center"
                  >
                    <Redo2 size={20} className="mr-2" />
                    Reintentar
                  </button>
                  <button
                    onClick={handleGoBack}
                    className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg shadow-md hover:bg-gray-300 transition duration-150 ease-in-out flex items-center"
                  >
                    <Home size={20} className="mr-2" />
                    Volver al Inicio
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const renderCreateModelModal = () => {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center font-inter">
        <div className="relative bg-white p-8 rounded-xl shadow-lg max-w-md w-full mx-4">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-2xl font-bold text-gray-800">Crear Modelo Personalizado</h3>
            <button onClick={() => setShowCreateModelModal(false)} className="text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
          </div>
          <form onSubmit={handleCreateModelSubmit}>
            <div className="mb-4">
              <label htmlFor="modelName" className="block text-sm font-semibold text-gray-700 mb-2">Nombre del Modelo</label>
              <input
                type="text"
                id="modelName"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div className="mb-4">
              <label htmlFor="modelType" className="block text-sm font-semibold text-gray-700 mb-2">Tipo de Modelo</label>
              <div className="relative">
                <select
                  id="modelType"
                  value={modelType}
                  onChange={(e) => setModelType(e.target.value)}
                  className="block appearance-none w-full bg-white border border-gray-300 text-gray-700 py-3 px-4 pr-8 rounded-lg leading-tight focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option>Movimiento Libre</option>
                  <option>Gestos Específicos</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                  <ChevronDown size={20} />
                </div>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Gestos para Entrenar</label>
              {gesturesToTrain.map((gesture, index) => (
                <div key={index} className="flex items-center mb-2">
                  <input
                    type="text"
                    value={gesture}
                    onChange={(e) => handleGestureInputChange(e, index)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder={`Gesto ${index + 1}`}
                  />
                  {index === gesturesToTrain.length - 1 && (
                    <button type="button" onClick={handleAddGestureField} className="ml-2 text-purple-600 hover:text-purple-800 transition duration-150">
                      <PlusCircle size={24} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="submit"
              className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg shadow-md hover:bg-purple-700 transition duration-150 ease-in-out"
            >
              Crear Modelo
            </button>
          </form>
        </div>
      </div>
    );
  };

  return (
    <>
      {renderView()}
      {showCreateModelModal && renderCreateModelModal()}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        .font-inter {
          font-family: 'Inter', sans-serif;
        }
      `}</style>
    </>
  );
};

export default App;