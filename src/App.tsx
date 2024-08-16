import './App.css';
import lottieWeb from 'lottie-web';
import { useEffect, useRef, useState } from 'react';
import logo from './logo.svg';
import { BlobReader, TextWriter, ZipReader } from "@zip.js/zip.js";
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

let isDebug = false;
let anim: any = null;
let thorvgLottiePlayer: LottiePlayer;

function App() {
  const initialized = useRef(false);
  const [uploaded, setUploaded] = useState(false);
  const [fileLength, setFileLength] = useState(0);
  
  const [curerntFile, setCurrentFile] = useState('');
  const [currentCompatibility, setCurrentCompatibility] = useState('');

  let [passedList, setPassedList] = useState<string[]>([]);
  let [failedList, setFailedList] = useState<string[]>([]);

  let [cnt, setCnt] = useState(0);
  let [failedCnt, setFailedCnt] = useState(0);
  let [log, setLog] = useState<string[]>([]);

  const hasDone = cnt !== 0 && cnt >= fileLength - 1;
  const isTesting = fileLength > 0 && !hasDone;
  const isReady = fileLength < 1;

  useEffect(() => {
    if (initialized.current) {
      return;
    }

    // check debug mode from query param
    isDebug = window.location.href.includes('debug');
    initialized.current = true;
  }, []);

  const start = async (fileList: any) => {
    let logText = '';

    for (const file of fileList) {
      setCurrentFile(file.name);
      setCurrentCompatibility('Checking...');

      const res = await run(file);
      if (!res) {
        // TODO Error
      }

      const { average, frames } = res as SimiliarityResult;
      const passed = average >= successPercentage;

      const resultText = `${passed ? '✅' : '❗'} ${file.name} - Similarity: ${average}%`;
      logText = resultText;
      for (let i = 0; i < frames.length; i++) {
        logText += `\n * Frame ${i} : ${frames[i]}%`;
      }

      setCurrentCompatibility('' + average + '%');
      console.info(logText);
      log.push(logText);

      setLog(log.slice());

      // save result 
      try {
        if (passed) {
          passedList.push(file.name);
          setPassedList(passedList.slice());
          await saveResult(resultText);
        } else {
          failedList.push(file.name);
          setFailedList(failedList.slice());
          failedCnt += 1;
          setFailedCnt(failedCnt);
          await saveError(resultText);
        }
      } catch (err) {
        // TODO : save error
        console.log(err);
      }

      cnt += 1;
      setCnt(cnt);
    }

    exportToPDF();
    saveDebugResult();
  };

  const exportToPDF = async () => {
    const doc = new jsPDF();
    const resultBoard = document.querySelector('.result-board');
    const passedBoard = document.querySelector('.result') as any;

    const passRate = Math.ceil((cnt - failedCnt) / cnt * 100);
    doc.text(`ThorVG Testing Results (Passed: ${cnt - failedCnt} / ${cnt})`, 20, 20);
    doc.text(`Pass Rate : ${passRate}%`, 20, 30);

    passedBoard.style.display = 'block';

    await html2canvas(resultBoard as any).then(canvas => {
      // Few necessary setting options
      const imgWidth = 208; // your own stuff to calc the format you want
      const imgHeight = canvas.height * imgWidth / canvas.width; // your own stuff to calc the format you want
      const contentDataURL = canvas.toDataURL('image/png');
      doc.addImage(contentDataURL, 'PNG', 0, 40, imgWidth, imgHeight);

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

        // get frames (for 0%, 25%, 50%, 75%, 100%)
        const totalFrame = thorvgLottiePlayer.totalFrame;
        const frameList = [0, Math.floor(totalFrame / 4), Math.floor(totalFrame / 2), Math.floor(totalFrame * 3 / 4), totalFrame];

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

  const saveResult = async (logText: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const resultBoard = document.querySelector('.result');
      const resultRow = document.querySelector('.result-row')?.cloneNode(true) as any;
      resultBoard?.appendChild(resultRow);
  
      const resultText = document.createElement('span');
      resultText.innerText = logText;
      resultText.style.width = '200px';
      resultRow?.appendChild(resultText);
  
      const thorvgCanvas = document.querySelector("lottie-player")?.shadowRoot?.querySelector('canvas');
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
  
      resultRow?.appendChild(thorvgCloneCanvas);
      resultRow?.appendChild(lottieCloneCanvas);
      resultRow?.appendChild(diffCloneImg);

      setTimeout(() => {
        resolve();
      }, 150);
    });
  }

  const saveError = async (logText: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const resultBoard = document.querySelector('.result-error');
      const resultRow = document.querySelector('.result-error-row')?.cloneNode(true) as any;
      resultBoard?.appendChild(resultRow);
  
      const resultText = document.createElement('span');
      resultText.style.width = '200px';
      resultText.innerText = logText;
      resultRow?.appendChild(resultText);
  
      const thorvgCanvas = document.querySelector("lottie-player")?.shadowRoot?.querySelector('canvas');
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
  
      resultRow?.appendChild(thorvgCloneCanvas);
      resultRow?.appendChild(lottieCloneCanvas);
      resultRow?.appendChild(diffCloneImg);

      setTimeout(() => {
        resolve();
      }, 150);
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
    const thorvgCanvas: any = document.querySelector("lottie-player")?.shadowRoot?.querySelector('canvas');
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

  return (
    <>
      <div className="App">
        <header className="App-header">
          {
            isReady ? <p>ThorVG Test Automation</p>
            :
            hasDone ? <p>DONE <br/>(Passed: {cnt - failedCnt} / {cnt})</p>
            :
            <p>
              {curerntFile} - {currentCompatibility}
              
              {
                (fileLength > 0 && !hasDone) &&
                <img src={logo} className="App-logo" alt="logo" />
              }
            </p>
          }

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
                  <p style={{ lineHeight: '32px' }}>Upload or drop <br/>LottieFiles or Zip here to test</p>
                </div>
              }
              name="file"
              types={['json', 'zip']}
              multiple
            />
          }

          <div style={{ height: 44 }}></div>
          
          {
            isReady ||
            <div style={{ fontSize: 13, height: 200, overflowY: 'scroll', marginBottom: 32 }}>
              {
                log.map((line, i) => <div key={i} style={{ marginBottom: 4, textAlign: 'left' }}>{line.split('\n').map((v, i) => <p key={i}>{v}</p>)}</div>)
              }
            </div>
          }
        </header>
        
        <div style={{ display: 'block', overflowX: 'scroll', width: '100%', position: 'absolute', opacity: 0, top: 0, zIndex: -100 }}>
          <div className="thorvg-canvas" style={{ width: testingSize, height: testingSize }}>
          </div>
          <div className="lottie-canvas" style={{ width: testingSize, height: testingSize }}></div>
          <img id="diff-img" width={testingSize} height={testingSize} />
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
