import './App.css';
import lottieWeb from 'lottie-web';
import { useEffect, useRef, useState } from 'react';
import logo from './logo.svg';
import { BlobReader, BlobWriter, TextWriter, ZipReader, ZipWriter } from "@zip.js/zip.js";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { FileUploader } from "react-drag-drop-files";
import { size, successPercentage, testingSize, loadTimeout } from "./utils/constant";
import { diffCanvas } from './utils/diff';
import '@thorvg/lottie-player';
import { LottiePlayer } from '@thorvg/lottie-player';

declare global {
  interface Window { 
    Module: any; 
    player: any; 
  }
}

interface SimiliarityResult {
  average: number;
  frames: number[];
}

type TestStatus = 'passed' | 'failed';

interface LogEntry {
  id: string;
  name: string;
  status: TestStatus;
  average: number;
  frames: number[];
  timestamp: number;
}

let isDebug = false;
let anim: any = null;
let thorvgLottiePlayer: LottiePlayer;

function App() {
  const initialized = useRef(false);
  const [version, setVersion] = useState('');
  const [thorvgRenderer, setThorvgRenderer] = useState<'sw' | 'wg'>('sw');
  const [isFrameTestingEnabled, setIsFrameTestingEnabled] = useState(true);
  const [shouldAutoDownloadPdf, setShouldAutoDownloadPdf] = useState(false);
  const [shouldDownloadFailedZip, setShouldDownloadFailedZip] = useState(false);

  const [uploaded, setUploaded] = useState(false);
  const [fileLength, setFileLength] = useState(0);
  
  const [curerntFile, setCurrentFile] = useState('');
  const [currentCompatibility, setCurrentCompatibility] = useState('');

  let [passedList, setPassedList] = useState<string[]>([]);
  let [failedList, setFailedList] = useState<string[]>([]);

  let [cnt, setCnt] = useState(0);
  let [failedCnt, setFailedCnt] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);

  const failedFilesRef = useRef<{ name: string; file: File }[]>([]);
  const fileUrlMap = useRef<Map<File, string>>(new Map());

  const hasDone = cnt !== 0 && cnt >= fileLength - 1;
  // const isTesting = fileLength > 0 && !hasDone;
  const isReady = fileLength < 1;
  const isRunning = fileLength > 0 && !hasDone;
  const status = isReady ? 'IDLE' : isRunning ? 'RUNNING' : 'COMPLETE';
  const passRate = cnt > 0 ? Math.round(((cnt - failedCnt) / cnt) * 100) : 0;
  const progressPercent = fileLength > 0 ? Math.round((cnt / fileLength) * 100) : 0;

  useEffect(() => {
    if (initialized.current) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const rendererParam = params.get('renderer');
    const normalizedRenderer = rendererParam?.toLowerCase();
    if (normalizedRenderer === 'sw' || normalizedRenderer === 'wg') {
      setThorvgRenderer(normalizedRenderer);
    }

    const frameParam = params.get('frameTest');
    const normalizedFrameParam = frameParam?.toLowerCase();
    if (normalizedFrameParam === 'on') {
      setIsFrameTestingEnabled(true);
    } else if (normalizedFrameParam === 'off') {
      setIsFrameTestingEnabled(false);
    }

    const autoPdfParam = params.get('autoPdf');
    const normalizedAutoPdfParam = autoPdfParam?.toLowerCase();
    if (normalizedAutoPdfParam === 'on') {
      setShouldAutoDownloadPdf(true);
    } else if (normalizedAutoPdfParam === 'off') {
      setShouldAutoDownloadPdf(false);
    }

    const failedZipParam = params.get('failedZip');
    const normalizedFailedZipParam = failedZipParam?.toLowerCase();
    if (normalizedFailedZipParam === 'on') {
      setShouldDownloadFailedZip(true);
    } else if (normalizedFailedZipParam === 'off') {
      setShouldDownloadFailedZip(false);
    }

    // check debug mode from query param
    isDebug = window.location.href.includes('debug');
    initialized.current = true;
    loadVersion();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rendererValue = thorvgRenderer;
    const frameValue = isFrameTestingEnabled ? 'on' : 'off';
    const autoPdfValue = shouldAutoDownloadPdf ? 'on' : 'off';
    const failedZipValue = shouldDownloadFailedZip ? 'on' : 'off';

    let shouldUpdate = false;

    if (params.get('renderer') !== rendererValue) {
      params.set('renderer', rendererValue);
      shouldUpdate = true;
    }

    if (params.get('frameTest') !== frameValue) {
      params.set('frameTest', frameValue);
      shouldUpdate = true;
    }

    if (params.get('autoPdf') !== autoPdfValue) {
      params.set('autoPdf', autoPdfValue);
      shouldUpdate = true;
    }

    if (params.get('failedZip') !== failedZipValue) {
      params.set('failedZip', failedZipValue);
      shouldUpdate = true;
    }

    if (!shouldUpdate) {
      return;
    }

    const queryString = params.toString();
    const newUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', newUrl);
  }, [thorvgRenderer, isFrameTestingEnabled, shouldAutoDownloadPdf, shouldDownloadFailedZip]);

  const getFileDownloadUrl = (file: File) => {
    const cached = fileUrlMap.current.get(file);
    if (cached) {
      return cached;
    }

    const url = URL.createObjectURL(file);
    fileUrlMap.current.set(file, url);
    return url;
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const millis = date.getMilliseconds().toString().padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${millis}`;
  };

  const start = async (fileList: any) => {
    failedFilesRef.current = [];
    fileUrlMap.current.forEach((url) => URL.revokeObjectURL(url));
    fileUrlMap.current.clear();
    setLog([]);

    for (const file of fileList) {
      setCurrentFile(file.name);
      setCurrentCompatibility('Checking...');

      const res = await run(file);
      if (!res) {
        // TODO Error
      }

      const { average, frames } = res as SimiliarityResult;
      const formattedAverage = average.toFixed(2);
      const passed = average >= successPercentage;

      const status: TestStatus = passed ? 'passed' : 'failed';
      const entryTimestamp = Date.now();
      const frameResults = [...frames];

      const resultText = `${passed ? '✅' : '❗'} ${file.name} - Similarity: ${formattedAverage}%`;
      const frameDetails = frameResults
        .map((value, index) => ` * Frame ${index} : ${value}%`)
        .join('\n');
      const logText = `${resultText}${frameDetails ? `\n${frameDetails}` : ''}`;

      setCurrentCompatibility(`${formattedAverage}%`);
      console.info(logText);
      setLog((prev) => [
        ...prev,
        {
          id: `${entryTimestamp}-${Math.random().toString(16).slice(2, 8)}`,
          name: file.name,
          status,
          average: parseFloat(formattedAverage),
          frames: frameResults,
          timestamp: entryTimestamp,
        },
      ]);

      // save result 
      try {
        if (passed) {
          passedList.push(file.name);
          setPassedList(passedList.slice());
          await saveResult(resultText, file, formattedAverage);
        } else {
          failedList.push(file.name);
          setFailedList(failedList.slice());
          failedCnt += 1;
          setFailedCnt(failedCnt);
          failedFilesRef.current.push({ name: file.name, file });
          await saveError(resultText, file, formattedAverage);
        }
      } catch (err) {
        // TODO : save error
        console.error('Error saving result:', err);
      }

      cnt += 1;
      setCnt(cnt);
      (document.querySelector("lottie-player") as LottiePlayer).destroy();
    }

    if (shouldAutoDownloadPdf && cnt > 0) {
      await exportToPDF();
    }
    if (shouldDownloadFailedZip && failedFilesRef.current.length > 0) {
      await downloadFailedZip();
    }
    saveDebugResult();
  };

  const downloadFailedZip = async () => {
    if (!failedFilesRef.current.length) {
      return;
    }

    try {
      const zipWriter = new ZipWriter(new BlobWriter("application/zip"));
      for (const { name, file } of failedFilesRef.current) {
        await zipWriter.add(name, new BlobReader(file));
      }
      const blob = await zipWriter.close();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      anchor.download = `thorvg-failed-${timestamp}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error creating failed zip:', err);
    }
  };

  const exportToPDF = async () => {
    const doc = new jsPDF();
    const resultBoard = document.querySelector('.result-board');
    const passedBoard = document.querySelector('.result') as any;

    const passRate = Math.ceil((cnt - failedCnt) / cnt * 100);
    doc.text(`ThorVG Testing Results (Passed: ${cnt - failedCnt} / ${cnt})`, 20, 20);
    doc.text(`Pass Rate : ${passRate}%`, 20, 30);
    doc.text(`Version : v${version}`, 20, 40);

    passedBoard.style.display = 'block';

    await html2canvas(resultBoard as any).then(canvas => {
      // Few necessary setting options
      const imgWidth = 208; // your own stuff to calc the format you want
      const imgHeight = canvas.height * imgWidth / canvas.width; // your own stuff to calc the format you want
      const contentDataURL = canvas.toDataURL('image/png');
      doc.addImage(contentDataURL, 'PNG', 0, 50, imgWidth, imgHeight);

      if (isDebug) {
        const uriString = doc.output('datauristring');
        const debugResult = document.querySelector('.debug-result');
        const text = document.createElement('span');;
        text.textContent = uriString;
        text.classList.add('debug-result-pdf');
        debugResult?.appendChild(text);
        return;
      }

      doc.save('result.pdf');
      passedBoard.style.display = 'none';
    });
  }

  const saveDebugResult = async () => {
    if (!isDebug) {
      return;
    }

    const debugResult = document.querySelector('.debug-result');
    const text = document.createElement('span');
    text.textContent = JSON.stringify({
      passed: passedList,
      failed: failedList,
    });

    text.classList.add('debug-result-list');
    debugResult?.appendChild(text);
  };

  const run = async (file: File): Promise<SimiliarityResult | null> => {
    return new Promise(async (resolve, reject) => { // !
      try {
        const thorvgCanvasWrapper = document.querySelector(".thorvg-canvas") as HTMLElement;
        const lottieCanvasWrapper: any = document.querySelector(".lottie-canvas") as HTMLElement;
        const diffImg = document.querySelector("#diff-img") as HTMLElement;

        thorvgCanvasWrapper.innerHTML = '';
        lottieCanvasWrapper.innerHTML = '';
        diffImg.setAttribute('src', '');

        let isTimeout = false;
        const timer = setTimeout(() => {
          console.warn('ThorVG load timeout');
          isTimeout = true;
          resolve(null);
        }, loadTimeout);

        const isLoaded = await load(file);
        clearTimeout(timer);

        if (!isLoaded || isTimeout) {
          console.warn('ThorVG load error');
          return resolve(null);
        }

        const results = [];

        const rawTotalFrame = thorvgLottiePlayer.totalFrame;
        const totalFrame =
          typeof rawTotalFrame === 'number' && Number.isFinite(rawTotalFrame)
            ? Math.max(0, Math.floor(rawTotalFrame))
            : 0;
        const baseFrameList = isFrameTestingEnabled
          ? [0, Math.floor(totalFrame / 4), Math.floor(totalFrame / 2), Math.floor(totalFrame * 3 / 4), totalFrame]
          : [0];
        const frameList = Array.from(
          new Set(baseFrameList.map((frame) => Math.min(Math.max(Math.floor(frame), 0), totalFrame))),
        );

        console.log('Total frame: ', totalFrame);
        for (const frame of frameList) {
          await seek(frame);
          const compatibility = await test();

          results.push(compatibility);
        }

        resolve({
          average: results.reduce((a, b) => a + b, 0) / results.length,
          frames: results,
        });
      } catch (err) {
        reject(err);  // ! return err; => reject(err);
      }
    })
  };

  const createHoverableCanvasWrapper = (canvas: HTMLCanvasElement, jsonData: string, type: 'thorvg' | 'lottie') => {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-block';
    wrapper.style.width = `${size}px`;
    wrapper.style.height = `${size}px`;
    wrapper.style.cursor = 'pointer';
    wrapper.appendChild(canvas);

    let overlay: HTMLDivElement | null = null;
    let animInstance: any = null;
    let playerInstance: LottiePlayer | null = null;

    const createOverlay = () => {
      if (overlay) return;

      const overlaySize = 300; // Enlarged size for overlay
      overlay = document.createElement('div');
      overlay.style.position = 'absolute';
      overlay.style.top = '50%';
      overlay.style.left = '50%';
      overlay.style.transform = 'translate(-50%, -50%)';
      overlay.style.width = `${overlaySize}px`;
      overlay.style.height = `${overlaySize}px`;
      overlay.style.zIndex = '1000';
      overlay.style.border = '2px solid #4caf50';
      overlay.style.borderRadius = '8px';
      overlay.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.3)';
      overlay.style.backgroundColor = '#fff';
      overlay.style.pointerEvents = 'none';

      try {
        const animData = JSON.parse(jsonData);

        if (type === 'thorvg') {
          playerInstance = document.createElement('lottie-player') as LottiePlayer;
          playerInstance.style.width = `${overlaySize}px`;
          playerInstance.style.height = `${overlaySize}px`;
          playerInstance.renderConfig = {
            // @ts-ignore
            renderer: thorvgRenderer,
            enableDevicePixelRatio: true,
          };
          overlay.appendChild(playerInstance);
          wrapper.appendChild(overlay);

          playerInstance.src = animData;
          playerInstance.addEventListener('load', () => {
            playerInstance?.play();
          });
        } else {
          const container = document.createElement('div');
          container.style.width = `${overlaySize}px`;
          container.style.height = `${overlaySize}px`;
          container.style.overflow = 'hidden';
          overlay.appendChild(container);
          wrapper.appendChild(overlay);

          // Add to DOM first, then initialize lottie-web
          setTimeout(() => {
            animInstance = lottieWeb.loadAnimation({
              container: container,
              renderer: 'canvas',
              loop: true,
              autoplay: true,
              animationData: animData,
              rendererSettings: {
                clearCanvas: true,
                preserveAspectRatio: 'xMidYMid meet',
              },
            });
          }, 10);
        }
      } catch (err) {
        console.error('Error creating animation overlay:', err);
      }
    };

    const removeOverlay = () => {
      if (!overlay) return;

      if (animInstance) {
        animInstance.destroy();
        animInstance = null;
      }

      if (playerInstance) {
        playerInstance.destroy();
        playerInstance = null;
      }

      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      overlay = null;
    };

    wrapper.addEventListener('mouseenter', createOverlay);
    wrapper.addEventListener('mouseleave', removeOverlay);

    return wrapper;
  };

  const createNameCell = (statusIcon: string, file: File, logText: string, formattedAverage: string) => {
    const container = document.createElement('div');
    container.style.width = '200px';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'flex-start';
    container.style.gap = '4px';
    container.style.textAlign = 'left';
    container.title = logText;

    const titleRow = document.createElement('div');
    titleRow.style.display = 'flex';
    titleRow.style.alignItems = 'center';
    titleRow.style.gap = '6px';
    titleRow.style.width = '100%';
    titleRow.style.maxWidth = '200px';

    const iconSpan = document.createElement('span');
    iconSpan.textContent = statusIcon;
    titleRow.appendChild(iconSpan);

    const link = document.createElement('a');
    link.href = getFileDownloadUrl(file);
    link.download = file.name;
    link.textContent = file.name;
    link.style.flex = '1';
    link.style.minWidth = '0';
    link.style.display = 'inline-block';
    link.style.overflow = 'hidden';
    link.style.textOverflow = 'ellipsis';
    link.style.whiteSpace = 'nowrap';
    link.style.color = '#1976d2';
    link.style.textDecoration = 'none';
    link.setAttribute('role', 'link');
    titleRow.appendChild(link);

    container.appendChild(titleRow);

    const similaritySpan = document.createElement('span');
    similaritySpan.textContent = `Similarity: ${formattedAverage}%`;
    similaritySpan.style.fontSize = '12px';
    similaritySpan.style.color = '#616161';
    container.appendChild(similaritySpan);

    return container;
  };

  const saveResult = async (logText: string, file: File, formattedAverage: string): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      const resultBoard = document.querySelector('.result');
      const resultRow = document.querySelector('.result-row')?.cloneNode(true) as any;
      resultBoard?.appendChild(resultRow);

      const nameCell = createNameCell('✅', file, logText, formattedAverage);
      resultRow?.appendChild(nameCell);

      const thorvgCanvas = document.querySelector("lottie-player")?.querySelector('canvas');
      const lottieCanvas = document.querySelector('.lottie-canvas > canvas');
      const diffImg = document.querySelector('#diff-img');

      const thorvgCloneCanvas = thorvgCanvas?.cloneNode(true) as any;
      const lottieCloneCanvas = lottieCanvas?.cloneNode(true) as any;
      const diffCloneImg = diffImg?.cloneNode(true) as any;

      thorvgCloneCanvas.width = size;
      thorvgCloneCanvas.style.width = `${size}px`;
      thorvgCloneCanvas.height = size;
      thorvgCloneCanvas.style.height = `${size}px`;

      lottieCloneCanvas.width = size;
      lottieCloneCanvas.style.width = `${size}px`;
      lottieCloneCanvas.height = size;
      lottieCloneCanvas.style.height = `${size}px`;

      diffCloneImg.width = size;
      diffCloneImg.height = size;

      thorvgCloneCanvas.getContext('2d').drawImage(thorvgCanvas, 0, 0, size, size);
      lottieCloneCanvas.getContext('2d').drawImage(lottieCanvas, 0, 0, size, size);

      // Read JSON data from file
      const reader = new FileReader();
      reader.readAsText(file);
      reader.onload = () => {
        const jsonData = reader.result as string;

        // Create wrapper containers with hover functionality
        const thorvgWrapper = createHoverableCanvasWrapper(thorvgCloneCanvas, jsonData, 'thorvg');
        const lottieWrapper = createHoverableCanvasWrapper(lottieCloneCanvas, jsonData, 'lottie');

        resultRow?.appendChild(thorvgWrapper);
        resultRow?.appendChild(lottieWrapper);
        resultRow?.appendChild(diffCloneImg);

        setTimeout(() => {
          resolve();
        }, 150);
      };
    });
  }

  const saveError = async (logText: string, file: File, formattedAverage: string): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      const resultBoard = document.querySelector('.result-error');
      const resultRow = document.querySelector('.result-error-row')?.cloneNode(true) as any;
      resultBoard?.appendChild(resultRow);

      const nameCell = createNameCell('❗', file, logText, formattedAverage);
      resultRow?.appendChild(nameCell);

      const thorvgCanvas = document.querySelector("lottie-player")?.querySelector('canvas');
      const lottieCanvas = document.querySelector('.lottie-canvas > canvas');
      const diffImg = document.querySelector('#diff-img');

      const thorvgCloneCanvas = thorvgCanvas?.cloneNode(true) as any;
      const lottieCloneCanvas = lottieCanvas?.cloneNode(true) as any;
      const diffCloneImg = diffImg?.cloneNode(true) as any;

      thorvgCloneCanvas.width = size;
      thorvgCloneCanvas.style.width = `${size}px`;
      thorvgCloneCanvas.height = size;
      thorvgCloneCanvas.style.height = `${size}px`;

      lottieCloneCanvas.width = size;
      lottieCloneCanvas.style.width = `${size}px`;
      lottieCloneCanvas.height = size;
      lottieCloneCanvas.style.height = `${size}px`;

      diffCloneImg.width = size;
      diffCloneImg.height = size;

      thorvgCloneCanvas.getContext('2d').drawImage(thorvgCanvas, 0, 0, size, size);
      lottieCloneCanvas.getContext('2d').drawImage(lottieCanvas, 0, 0, size, size);

      // Read JSON data from file
      const reader = new FileReader();
      reader.readAsText(file);
      reader.onload = () => {
        const jsonData = reader.result as string;

        // Create wrapper containers with hover functionality
        const thorvgWrapper = createHoverableCanvasWrapper(thorvgCloneCanvas, jsonData, 'thorvg');
        const lottieWrapper = createHoverableCanvasWrapper(lottieCloneCanvas, jsonData, 'lottie');

        resultRow?.appendChild(thorvgWrapper);
        resultRow?.appendChild(lottieWrapper);
        resultRow?.appendChild(diffCloneImg);

        setTimeout(() => {
          resolve();
        }, 150);
      };
    });
  }

  const seek = async (frame: number): Promise<boolean> => {
    try {
      await thorvgLottiePlayer.seek(frame);
      await anim.goToAndStop(frame, true);
    } catch (err) {
      console.log(err);
      return false;
    }

    return true;
  }

  const test = async () => {
    const thorvgCanvas: any = document.querySelector("lottie-player")?.querySelector('canvas');
    const lottieCanvas: any = document.querySelector(".lottie-canvas > canvas");

    // resembleJS diff
    return await diffCanvas(thorvgCanvas, lottieCanvas);
  }

  const load = async (file: File) => {
    return new Promise<boolean>(async (resolve, reject) => {
      const lottieCanvas: any = document.querySelector(".lottie-canvas");
      const thorvgCanvas: any = document.querySelector(".thorvg-canvas");
      
      const reader = new FileReader();
      reader.readAsText(file);
      reader.onload = async () => {
        const json = reader.result as any;
    
        try {
          anim = lottieWeb.loadAnimation({
            container: lottieCanvas,
            renderer: "canvas",
            loop: false,
            autoplay: false,
            animationData: JSON.parse(json),
            rendererSettings: {
              clearCanvas: true,
            },
          });
        } catch (err) {
          console.error('LottieWeb load error');
          resolve(false);
        }

        thorvgLottiePlayer = document.createElement('lottie-player') as LottiePlayer;
        thorvgLottiePlayer.style.width = `${testingSize}px`;
        thorvgLottiePlayer.style.height = `${testingSize}px`;
        thorvgLottiePlayer.renderConfig = {
          // @ts-ignore
          renderer: thorvgRenderer, // 'sw' | 'wg'
          enableDevicePixelRatio: true,
        };
        thorvgCanvas.appendChild(thorvgLottiePlayer);

        const blob = new Blob([json], {type:"application/json"});
        const fr = new FileReader();

        fr.onloadend = () => {
          // TODO: load() function doesn't work in this scope
          // replaced with workaround code, should be reverted
          thorvgLottiePlayer.src = JSON.parse(json);
          thorvgLottiePlayer.addEventListener('error', () => {
            resolve(false);
          });

          thorvgLottiePlayer.addEventListener('load', () => {
            thorvgLottiePlayer.play();
            thorvgLottiePlayer.stop();
            resolve(true);
          });
        };

        fr.readAsArrayBuffer(blob);
      };
    });
  }

  const loadVersion = async () => {
    const thorvgLottiePlayer = document.createElement('lottie-player') as LottiePlayer;
    const { THORVG_VERSION } = thorvgLottiePlayer.getVersion();
    setVersion(THORVG_VERSION);
  }

  return (
    <>
      <div className="App">
        <header className="App-header" style={{ paddingBottom: uploaded ? 0 : 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, marginTop: 64 }}>
            <p style={{ margin: 0, fontSize: 28, fontWeight: 'bold' }}>ThorVG Test Automation</p>
            <span className="thorvg-version">v{version}</span>
            <span
              className="status-badge"
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '4px 12px',
                borderRadius: 12,
                letterSpacing: '0.05em',
                color: '#0f172a',
                backgroundColor: status === 'IDLE' ? '#94a3b8' : status === 'RUNNING' ? '#38bdf8' : '#4caf50',
              }}
            >
              {status}
            </span>
          </div>

          <div
            className="control-panel"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'center', marginTop: 0, marginBottom: 16 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label htmlFor="thorvg-renderer-select" style={{ fontSize: 14 }}>ThorVG Renderer</label>
              <select
                id="thorvg-renderer-select"
                value={thorvgRenderer}
                onChange={(event) => setThorvgRenderer(event.target.value as 'sw' | 'wg')}
                style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #bdbdbd' }}
              >
                <option value="sw">SW</option>
                <option value="wg">WG</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14 }}>Frame-by-frame Test</span>
              <button
                type="button"
                onClick={() => setIsFrameTestingEnabled((prev) => !prev)}
                style={{
                  padding: '4px 12px',
                  borderRadius: 4,
                  border: '1px solid #bdbdbd',
                  backgroundColor: isFrameTestingEnabled ? '#4caf50' : '#f44336',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                {isFrameTestingEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14 }}>Auto-download PDF</span>
              <button
                type="button"
                onClick={() => setShouldAutoDownloadPdf((prev) => !prev)}
                style={{
                  padding: '4px 12px',
                  borderRadius: 4,
                  border: '1px solid #bdbdbd',
                  backgroundColor: shouldAutoDownloadPdf ? '#4caf50' : '#f44336',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                {shouldAutoDownloadPdf ? 'ON' : 'OFF'}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14 }}>Download failed set (.zip)</span>
              <button
                type="button"
                onClick={() => setShouldDownloadFailedZip((prev) => !prev)}
                style={{
                  padding: '4px 12px',
                  borderRadius: 4,
                  border: '1px solid #bdbdbd',
                  backgroundColor: shouldDownloadFailedZip ? '#4caf50' : '#f44336',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                {shouldDownloadFailedZip ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {!isReady && (
            <div style={{ width: '100%', maxWidth: 720, marginBottom: 24, marginTop: 16 }}>
              <div style={{
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: 12,
                padding: 20,
                border: '1px solid rgba(255, 255, 255, 0.2)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>Queue</div>
                    <div style={{ fontSize: 24, fontWeight: 'bold' }}>{fileLength}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>Processed</div>
                    <div style={{ fontSize: 24, fontWeight: 'bold' }}>{cnt}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 13, color: '#4caf50', marginBottom: 4 }}>Success</div>
                    <div style={{ fontSize: 24, fontWeight: 'bold', color: '#4caf50' }}>{cnt - failedCnt}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 13, color: '#f44336', marginBottom: 4 }}>Failed</div>
                    <div style={{ fontSize: 24, fontWeight: 'bold', color: '#f44336' }}>{failedCnt}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>Pass Rate</div>
                    <div style={{ fontSize: 24, fontWeight: 'bold' }}>{passRate}%</div>
                  </div>
                </div>

                {isRunning && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                      <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{curerntFile}</span>
                      <span style={{ color: '#38bdf8', fontWeight: 600 }}>{currentCompatibility}</span>
                    </div>
                  </div>
                )}

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                    <span style={{ color: '#94a3b8' }}>Overall Progress</span>
                    <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{progressPercent}%</span>
                  </div>
                  <div style={{
                    width: '100%',
                    height: 8,
                    borderRadius: 999,
                    background: 'rgba(148, 163, 184, 0.3)',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${progressPercent}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #38bdf8 0%, #4caf50 100%)',
                      transition: 'width 280ms ease-out',
                    }}></div>
                  </div>
                </div>

                {isRunning && (
                  <div style={{ textAlign: 'center', marginTop: 16 }}>
                    <img src={logo} className="App-logo" alt="logo" />
                  </div>
                )}
              </div>
            </div>
          )}

          {
            uploaded ||
            <FileUploader 
              className="file-uploader"
              handleChange={async (_fileList: any) => {
                let fileList = [];
                if (_fileList[0].name.endsWith('.zip')) {
                  const fileBlob = _fileList[0];
                  const zipReader = new ZipReader(new BlobReader(fileBlob));
                  const entries = await zipReader.getEntries();

                  for (const entry of entries) {
                    if (entry.filename.startsWith('__MACOSX')) {
                      continue;
                    }

                    const helloWorldWriter = new TextWriter();
                    // @ts-ignore
                    const file = await entry.getData(helloWorldWriter);
                    const blob = new Blob([file], { type: 'application/json' });
                    fileList.push(new File([blob], entry.filename));
                  }

                  await zipReader.close();
                } else {
                  fileList = _fileList;
                }

                start(fileList);
                setFileLength(fileList.length);
                setUploaded(true);
              }}
              dropMessageStyle={{
                color: 'white',
                height: 200,
              }}
              children={
                <div
                  style={{ height: 150, border: '1px solid #bdbdbd', padding: 20, display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#bdbdbd', fontSize: 24 }}
                >
                  <p style={{ lineHeight: '32px' }}>Drag and drop file here or click to browse <br/>(lottie: .json/.lot, bulk: .zip)</p>
                </div>
              }
              name="file"
              types={['json', 'lot', 'zip']}
              multiple
            />
          }

          {
            isReady ||
            <div style={{ width: '100%', display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
              <div
                style={{
                  width: '100%',
                  maxWidth: 720,
                  borderRadius: 16,
                  padding: 20,
                  background: 'linear-gradient(135deg, #0f172a 0%, #111827 100%)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  boxShadow: '0 18px 40px rgba(15, 23, 42, 0.45)',
                  color: '#e2e8f0',
                  fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 12,
                    gap: 16,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: '0.16em',
                      color: '#94a3b8',
                    }}
                  >
                    TEST FEED
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      letterSpacing: '0.08em',
                      color: '#38bdf8',
                    }}
                  >
                    {fileLength > 0 ? `PROGRESS ${cnt}/${fileLength}` : `ENTRIES ${log.length}`}
                  </span>
                </div>

                <div
                  style={{
                    maxHeight: 260,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    paddingRight: 4,
                  }}
                >
                  {
                    log.length === 0
                      ? (
                        <div
                          style={{
                            padding: '16px 0',
                            textAlign: 'center',
                            fontSize: 13,
                            color: '#94a3b8',
                            fontFamily: 'Menlo, Consolas, "SFMono-Regular", monospace',
                          }}
                        >
                          Waiting for test results…
                        </div>
                      )
                      : log.slice().reverse().map((entry) => {
                          const statusColor = entry.status === 'passed' ? '#4caf50' : '#f44336';
                          const statusLabel = entry.status === 'passed' ? 'PASS' : 'FAIL';
                          const gradientAccent = entry.status === 'passed'
                            ? 'rgba(76, 175, 80, 0.12)'
                            : 'rgba(244, 67, 54, 0.12)';
                          const frameBadgeBackground = entry.status === 'passed'
                            ? 'rgba(76, 175, 80, 0.22)'
                            : 'rgba(244, 67, 54, 0.22)';
                          return (
                            <div
                              key={entry.id}
                              style={{
                                borderRadius: 12,
                                border: `1px solid ${statusColor}33`,
                                background: `linear-gradient(135deg, ${gradientAccent} 0%, rgba(17, 24, 39, 0.9) 100%)`,
                                padding: '14px 16px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 10,
                                boxShadow: '0 12px 28px rgba(15, 23, 42, 0.45)',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 12,
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    minWidth: 0,
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 700,
                                      padding: '2px 10px',
                                      borderRadius: 999,
                                      letterSpacing: '0.18em',
                                      color: '#0f172a',
                                      backgroundColor: statusColor,
                                      fontFamily: 'Menlo, Consolas, "SFMono-Regular", monospace',
                                    }}
                                  >
                                    {statusLabel}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 14,
                                      fontWeight: 600,
                                      color: '#e2e8f0',
                                      maxWidth: 360,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                    title={entry.name}
                                  >
                                    {entry.name}
                                  </span>
                                </div>
                                <span
                                  style={{
                                    fontSize: 12,
                                    fontFamily: 'Menlo, Consolas, "SFMono-Regular", monospace',
                                    color: '#94a3b8',
                                  }}
                                >
                                  {formatTimestamp(entry.timestamp)}
                                </span>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    fontSize: 12,
                                    fontWeight: 500,
                                    color: '#cbd5f5',
                                  }}
                                >
                                  <span>Similarity</span>
                                  <span style={{ fontFamily: 'Menlo, Consolas, "SFMono-Regular", monospace' }}>
                                    {entry.average.toFixed(2)}%
                                  </span>
                                </div>
                                <div
                                  style={{
                                    width: '100%',
                                    height: 6,
                                    borderRadius: 999,
                                    background: 'rgba(148, 163, 184, 0.2)',
                                    overflow: 'hidden',
                                  }}
                                >
                                  <div
                                    style={{
                                      width: `${Math.max(0, Math.min(entry.average, 100))}%`,
                                      height: '100%',
                                      background: statusColor,
                                      transition: 'width 280ms ease-out',
                                    }}
                                  ></div>
                                </div>
                              </div>

                              {
                                entry.frames.length > 0 &&
                                <div
                                  style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: 8,
                                    fontSize: 11,
                                    color: '#e2e8f0',
                                  }}
                                >
                                  {
                                    entry.frames.map((value, index) => (
                                      <span
                                        key={`${entry.id}-frame-${index}`}
                                        style={{
                                          padding: '4px 8px',
                                          borderRadius: 8,
                                          backgroundColor: frameBadgeBackground,
                                          fontFamily: 'Menlo, Consolas, "SFMono-Regular", monospace',
                                        }}
                                      >
                                        F{index}: {typeof value === 'number' ? value.toFixed(2) : value}%
                                      </span>
                                    ))
                                  }
                                </div>
                              }
                            </div>
                          );
                        })
                  }
                </div>
              </div>
            </div>
          }
        </header>
        
        <div style={{ display: 'block', overflowX: 'scroll', width: '100%', position: 'absolute', opacity: 0, top: 0, zIndex: -100 }}>
          <div className="thorvg-canvas" style={{ position: 'fixed', width: testingSize, height: testingSize }}>
          </div>
          <div className="lottie-canvas" style={{ width: testingSize, height: testingSize }}></div>
          <img id="diff-img" alt="Image diff" width={testingSize} height={testingSize} />
        </div>
      </div>

      <div className="result-board" style={{ width: '100%', display: 'flex', flexDirection: 'row', justifyContent: 'center', backgroundColor: '#f6f6f6' }}>
        <div className='result-error' style={{ padding: 24 }}>
          <div className='result-error-row-first' style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'start', marginBottom: 20, fontWeight: 'bold' }}>
            <div style={{ width: 200, textAlign: 'center' }}>Name</div>
            <div style={{ width: 100, textAlign: 'center' }}>ThorVG</div>
            <div style={{ width: 100, textAlign: 'center' }}>Expectation</div>
            <div style={{ width: 100, textAlign: 'center' }}>Diff</div>
          </div>
          <div className='result-error-row' style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', borderBottom: '1px solid #bdbdbd' }}>
          </div>
        </div>

        <div className='result' style={{ padding: 24, display: 'none' }}>
          <div className='result-error-row-first' style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'start', marginBottom: 20, fontWeight: 'bold' }}>
            <div style={{ width: 200, textAlign: 'center' }}>Name</div>
            <div style={{ width: 100, textAlign: 'center' }}>ThorVG</div>
            <div style={{ width: 100, textAlign: 'center' }}>Expectation</div>
            <div style={{ width: 100, textAlign: 'center' }}>Diff</div>
          </div>
          <div className='result-row' style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', borderBottom: '1px solid #bdbdbd' }}>
          </div>
        </div>

        <div className="debug-result" hidden>

        </div>
      </div>
    </>
  );
}

export default App;
