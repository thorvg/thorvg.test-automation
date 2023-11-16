import "@lottiefiles/lottie-player";
import { useEffect, useRef, useState } from 'react';
import './App.css';
import logo from './logo.svg';
import Player from './utils/player';
// @ts-ignore
import { OpenCvProvider } from 'opencv-react';
import { FileUploader } from "react-drag-drop-files";
import { diffWithResembleJS } from './utils/diff';
import { testingSize, size, successPercentage } from "./utils/constant";
import { drawSvgIntoCanvas } from "./utils/drawer";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { BlobReader, ZipReader, TextWriter } from "@zip.js/zip.js";

declare global {
  interface Window { 
    Module: any; 
    player: any; 
  }
}

let player: any;
let cv: any;
let isDebug = false;

function App() {
  const initialized = useRef(false);
  const [uploaded, setUploaded] = useState(false);
  const [fileLength, setFileLength] = useState(0);
  
  const [curerntFile, setCurrentFile] = useState('');
  const [currentCompability, setCurrentCompability] = useState('');

  const [passedList, setPassedList] = useState<string[]>([]);
  const [failedList, setFailedList] = useState<string[]>([]);

  let [cnt, setCnt] = useState(0);
  let [failedCnt, setFailedCnt] = useState(0);
  let [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    if (initialized.current) {
      return;
    }

    // check debug mode from query param
    isDebug = window.location.href.includes('debug');

    initialized.current = true;

    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = '/wasm/thorvg-wasm.js';
    document.head.appendChild(script);

    script.onload = () => {
      window.Module.onRuntimeInitialized = () => {
        if (player != null) {
          return;
        }

        player = new Player();
        window.player = player;
      };
    };
  }, []);

  const start = async (fileList: any) => {
    let logText = '';

    for (const file of fileList) {
      setCurrentFile(file.name);
      setCurrentCompability('Checking...');

      const compability = await run(file);
      const isCompability = compability >= successPercentage;

      logText = `${isCompability ? '✅' : '❗'} ${file.name} \n * Similarity: ${compability}%`;

      setCurrentCompability('' + compability + '%');
      console.info(logText);
      log.push(logText);

      setLog(log.slice());

      // save result 
      try {
        if (isCompability) {
          passedList.push(file.name);
          await saveResult(logText);
        } else {
          failedList.push(file.name);
          failedCnt += 1;
          setFailedCnt(failedCnt);
          await saveError(logText);
        }
      } catch (err) {
        // TODO : save error
        console.log(err);
      }

      cnt += 1;
      setCnt(cnt);
    }

    exportToPDF();
    createClaasifyScript();
  };

  const exportToPDF = async () => {
    const doc = new jsPDF();
    const resultBoard = document.querySelector('.result-board');

    const compability = Math.ceil((cnt - failedCnt) / cnt * 100);
    doc.text(`ThorVG Testing Results (Passed: ${cnt - failedCnt} / ${cnt})`, 20, 20);
    doc.text(`Compability : ${compability}%`, 20, 30);

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

      doc.save('test.pdf'); // save / download
      doc.output('dataurlnewwindow'); // just open it
    });
  }

  const createClaasifyScript = async () => {
    let script = `mkdir -p ./passed ./failed;`;

    if (passedList.length > 0) {
      script += ` mv ${passedList.join(' ')} ./passed;`;
    }

    if (failedList.length > 0) {
      script += ` mv ${failedList.join(' ')} ./failed;`;
    }

    if (isDebug) {
      const debugResult = document.querySelector('.debug-result');
      const text = document.createElement('span');;
      text.textContent = script;
      text.classList.add('debug-result-script');
      debugResult?.appendChild(text);
      return;
    }

    await window.navigator.clipboard.writeText(script);
    alert("Copied script to clipboard! Put this command in the folder where the test files are located to classify them.");
  };


  const run = async (file: File): Promise<number> => {
    return new Promise((resolve, reject) => { // !
      try {
        const thorvgCanvas: any = document.querySelector("#thorvg-canvas");
        const lottieCanvas: any = document.querySelector("#lottie-canvas");
        const diffImg: any = document.querySelector("#diff-img");

        diffImg.setAttribute('src', '');
        thorvgCanvas.getContext('2d').clearRect(0, 0, testingSize, testingSize);
        lottieCanvas.getContext('2d').clearRect(0, 0, testingSize, testingSize);

        setTimeout(async () => {
          const isLoaded = await load(file);
          if (!isLoaded) {
            resolve(0);
          }

          setTimeout(async () => {
            try {
              const compability = await test();
              resolve(compability);
            } catch (err) {
              resolve(0);
            }
          }, 100);
        }, 200);
      } catch (err) {
        reject(err);  // ! return err; => reject(err);
      }
    })
  }

  const saveResult = async (logText: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const resultBoard = document.querySelector('.result');
      const resultRow = document.querySelector('.result-row')?.cloneNode(true) as any;
      resultBoard?.appendChild(resultRow);
  
      const resultText = document.createElement('span');
      resultText.innerText = logText;
      resultText.style.width = '200px';
      resultRow?.appendChild(resultText);
  
      const thorvgCanvas = document.querySelector('#thorvg-canvas');
      const lottieCanvas = document.querySelector('#lottie-canvas');
      const diffImg = document.querySelector('#diff-img');
      
      const thorvgCloneCanvas = thorvgCanvas?.cloneNode(true) as any;
      const lottieCloneCanvas = lottieCanvas?.cloneNode(true) as any;
      const diffCloneImg = diffImg?.cloneNode(true) as any;

      thorvgCloneCanvas.width = size;
      thorvgCloneCanvas.height = size;

      lottieCloneCanvas.width = size;
      lottieCloneCanvas.height = size;

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
  
      const thorvgCanvas = document.querySelector('#thorvg-canvas');
      const lottieCanvas = document.querySelector('#lottie-canvas');
      const diffImg = document.querySelector('#diff-img');
      
      const thorvgCloneCanvas = thorvgCanvas?.cloneNode(true) as any;
      const lottieCloneCanvas = lottieCanvas?.cloneNode(true) as any;
      const diffCloneImg = diffImg?.cloneNode(true) as any;

      thorvgCloneCanvas.width = size;
      thorvgCloneCanvas.height = size;

      lottieCloneCanvas.width = size;
      lottieCloneCanvas.height = size;

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

  const test = async () => {
    const thorvgCanvas: any = document.querySelector("#thorvg-canvas");
    const lottieCanvas: any = document.querySelector("#lottie-canvas");

    // copy lottie-svg to canvas
    try {
      // @ts-ignore
      const svg: any = document.querySelector('.lottie-player').shadowRoot.querySelector('svg');
      const canvas: any = document.querySelector("#lottie-canvas");

      await drawSvgIntoCanvas(svg, canvas);
    } catch (err) {
      console.log(err);
      return 0;
    }

    // resembleJS diff
    const compabilityWithResembleJS = await diffWithResembleJS(thorvgCanvas, lottieCanvas);
    return compabilityWithResembleJS;

    // // OpenCV diff
    // const compabilityOpenCV = diffWithOpenCV(cv, thorvgCanvas, lottieCanvas);
    // return compabilityOpenCV;
  }

  const load = async (file: File) => {
    return new Promise<boolean>(async (resolve, reject) => {
      const lottiePlayer: any = document.querySelector("lottie-player");
      const reader = new FileReader();
      reader.readAsText(file);
      reader.onload = async () => {
        const json = reader.result as any;

        try {
          // lottie-player
          lottiePlayer.load(json);
        } catch (err) {
          console.log('Mark as an error : maybe lottie issue');
          resolve(false);
        }
    
        // check JSON
        try {
          JSON.parse(json);
        } catch (err) {
          resolve(false);
        }
    
        const blob = new Blob([json], {type:"application/json"});
        const fr = new FileReader();

        fr.onloadend = () => {
          const bytes = fr.result as any;
          console.log(bytes);
          

          try {
            player.loadBytes(bytes);

            const playerTotalFrames = Math.floor(player.totalFrame);
            const lottieTotalFrames = Math.floor(lottiePlayer.getLottie().totalFrames);
            const targetFrame = Math.floor(playerTotalFrames / 2); // Run with middle frame
          
            player.seek(targetFrame);
            lottiePlayer.seek(targetFrame);

            console.log(`totalFrames ${playerTotalFrames} ${lottieTotalFrames}`);
          } catch (err) {
            console.log(err);
            return resolve(false);
          }

          resolve(true);
        };

        fr.readAsArrayBuffer(blob);
      };
    });
  }

  return (
    <OpenCvProvider onLoad={(_cv: any) => cv = _cv}>
      <div className="App">
        <header className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          {
            (cnt !== 0 && cnt >= fileLength - 1) ? <p>DONE</p>
            :
            <p>
              {curerntFile} - {currentCompability}
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

          
          <div style={{ marginBottom: 32, fontSize: 13, height: 200, overflowY: 'scroll' }}>
            {
              log.map((line, i) => <div style={{ marginBottom: 4 }}>{line}<br/></div>)
            }
          </div>
        </header>

        
        <div style={{ display: 'none', overflowX: 'scroll', width: '100%' }}>
          <canvas id="thorvg-canvas" width={testingSize} height={testingSize} />
          <canvas id="lottie-canvas" width={testingSize} height={testingSize} />
          <img id="diff-img" width={testingSize} height={testingSize} />

          <lottie-player
            class="lottie-player"
            // autoplay
            // loop={}
            // controls
            width={testingSize + 'px'}
            style={{ width: testingSize, height: testingSize }}
            mode="normal"
          />
        </div>
      </div>

      {/* <div style={{ display: 'none' }}>
        <canvas id="thorvg-output-canvas" width={512} height={512} />
        <canvas id="lottie-output-canvas" width={512} height={512} />
      </div> */}

      <div className="result-board" style={{ width: '100%', display: 'flex', flexDirection: 'row', justifyContent: 'center', backgroundColor: '#f6f6f6' }}>
        <div className='result-error' style={{ padding: 24 }}>
          <div className='result-error-row-first' style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'start', marginBottom: 20, fontWeight: 'bold' }}>
            <div style={{ width: 200, textAlign: 'center' }}>Name</div>
            <div style={{ width: 100, textAlign: 'center' }}>ThorVG</div>
            <div style={{ width: 100, textAlign: 'center' }}>lottie-js</div>
            <div style={{ width: 100, textAlign: 'center' }}>Diff</div>
          </div>
          <div className='result-error-row' style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', borderBottom: '1px solid #bdbdbd' }}>
          </div>
        </div>

        <div className='result' style={{ padding: 24 }}>
          <div className='result-error-row-first' style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'start', marginBottom: 20, fontWeight: 'bold' }}>
            <div style={{ width: 200, textAlign: 'center' }}>Name</div>
            <div style={{ width: 100, textAlign: 'center' }}>ThorVG</div>
            <div style={{ width: 100, textAlign: 'center' }}>lottie-js</div>
            <div style={{ width: 100, textAlign: 'center' }}>Diff</div>
          </div>
          <div className='result-row' style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', borderBottom: '1px solid #bdbdbd' }}>
          </div>
        </div>

        <div className="debug-result" hidden>

        </div>
      </div>
    </OpenCvProvider>
  );
}

export default App;
