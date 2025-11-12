#! /usr/bin/env ts-node
'use strict';

import puppeteer, { Browser } from 'puppeteer';
import fs from "fs";
import path from "path";
import { exec } from 'child_process';
// @ts-ignore
import art from 'ascii-art';
// @ts-ignore
import Table from 'cli-table';

const TEST_URL = 'https://thorvg-test-automation.vercel.app/?debug=true';

// Find browser executable path (cross-platform)
function findBrowserPath(): string | undefined {
  // Check environment variable first
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  // Possible Chrome executable names (by platform)
  const possibleNames = [
    'chrome',
    'chrome.exe',
    'chromium',
    'chromium.exe',
    'Google Chrome for Testing',
    'Google Chrome',
  ];

  // Recursively search directories for the executable
  function findExecutable(dir: string, depth: number = 0): string | undefined {
    // Limit maximum depth (avoid traversing too deep)
    if (depth > 10) {
      return undefined;
    }

    if (!fs.existsSync(dir)) {
      return undefined;
    }

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isFile()) {
          // Check if file name matches executable candidates
          if (possibleNames.includes(entry.name)) {
            // Verify execute permission (Unix-like)
            try {
              fs.accessSync(fullPath, fs.constants.X_OK);
              return fullPath;
            } catch {
              // On Windows, .exe files can run without explicit permission check
              if (entry.name.endsWith('.exe')) {
                return fullPath;
              }
            }
          }
        } else if (entry.isDirectory()) {
          // For macOS .app bundles, go into Contents/MacOS
          if (entry.name.endsWith('.app')) {
            const macosPath = path.join(fullPath, 'Contents', 'MacOS');
            const found = findExecutable(macosPath, depth + 1);
            if (found) {
              return found;
            }
          } else {
            // Recursively explore regular directories
            const found = findExecutable(fullPath, depth + 1);
            if (found) {
              return found;
            }
          }
        }
      }
    } catch (error) {
      // Ignore permission errors and continue
    }

    return undefined;
  }

  // Look for executables in local chrome directory
  const chromeDir = path.join(process.cwd(), 'chrome');
  const localPath = findExecutable(chromeDir);
  if (localPath) {
    return localPath;
  }

  // Check Puppeteer's default cache path
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (homeDir) {
    const cachePath = path.join(homeDir, '.cache', 'puppeteer', 'chrome');
    const cachePathResult = findExecutable(cachePath);
    if (cachePathResult) {
      return cachePathResult;
    }
  }

  return undefined;
}

let browser: Browser | undefined;
const main = async () => {
    // CLI Options
    // * -D : debug
    // * -E : excute classify
    // * -V : verbose
    const isDebug = process.argv.includes('-D');
    const executionMode = process.argv.includes('-E');
    const verbose = process.argv.includes('-V');

    const browserPath = findBrowserPath();
    const launchOptions: any = {
      headless: isDebug ? false : 'new',
      protocolTimeout: 3000000,
      ignoreHTTPSErrors: true,
    };

    // Explicitly set browser path when available
    if (browserPath) {
      launchOptions.executablePath = browserPath;
    }

    if (verbose) {
      console.log( browserPath ? `Using browser: ${browserPath}` : 'Using default Puppeteer browser');
    }

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    const textLogo = await art.font("ThorVG", 'doom').completed();
    console.log(textLogo);

    // Navigate the page to a URL
    await page.goto(TEST_URL);
    await page.setViewport({ width: 1080, height: 1024 });
    await page.waitForSelector('input');

    const targetDir = process.argv.pop() as string; // TODO: Should check filetype (single json/zip or directory)
    const fileList = fs.readdirSync(path.resolve(process.cwd(), targetDir)).filter(v => v.endsWith('.json')).map((file: string) => path.join(targetDir, file));
    
    const fileUploader = await page.$("input[type=file]");
    fileUploader?.uploadFile(...fileList);

    page.on('console', msg => {
      try {
        const log = msg.text();
        if (log.includes('Similarity')) {
          console.log('TEST LOG:', log);
        } else if (verbose) {
          console.log('VERBOSE LOG:', log);
        }
      } catch (error) {
        // Ignore errors in console event handler
      }
    });

    page.on('pageerror', error => {
      console.error('Page error:', error.message);
    });

    await page.waitForSelector('.debug-result-list', { timeout: 3000 * fileList.length });
    const json = await page.$eval('.debug-result-list', el => el.textContent) as string;
    const { passed, failed } = JSON.parse(json as string);

    if (executionMode) {
      let script = `mkdir -p ./passed ./failed;`;

      if (passed.length > 0) {
        script += ` mv ${passed.join(' ')} ./passed;`;
      }

      if (failed.length > 0) {
        script += ` mv ${failed.join(' ')} ./failed;`;
      }

      exec(`cd ${targetDir}; ${script}`, (error) => {
        if (error) {
          console.error('Error executing script:', error);
        }
      });
    }

    await page.waitForSelector('.debug-result-pdf');
    const pdfUriString = await page.$eval('.debug-result-pdf', el => el.textContent) as string;
    const base64Data = (pdfUriString as string).replace('data:application/pdf;filename=generated.pdf;base64,', '');
    const buf = Buffer.from(base64Data, 'base64');
    fs.writeFileSync('result.pdf', new Uint8Array(buf));

    const table = new Table({
      head: ['name', 'passed', 'failed'],
    });

    const results = [...passed, ...failed].map(v => [v, passed.includes(v) ? 'O' : 'X', failed.includes(v) ? 'O' : 'X']);
    (table as any).push(...results);
    console.log(table.toString());

    if (failed.length > 0) {
      process.exit(1);
    }
};

(async () => {
try {
  await main();
} catch (error: any) {
  if (error.message && (error.message.includes('socket hang up') || error.message.includes('Browser') || error.message.includes('executable'))) {
    console.error('❌ Browser connection error occurred.');
    console.error('Possible causes:');
    console.error('  1. Chrome/Chromium is not installed or Puppeteer cannot find the browser.');
    console.error('  2. Browser exited immediately after starting.');
    console.error('  3. Port conflict occurred.');
    console.error('\nSolutions:');
    console.error('  - Install browser with @puppeteer/browsers: npx @puppeteer/browsers install chrome@stable');
    console.error('  - Specify path via environment variable: export PUPPETEER_EXECUTABLE_PATH="/path/to/chrome"');
    console.error('  - Run in debug mode to check detailed logs: npx ts-node index.ts -D -V <target-dir>');
    console.error('  - Or install Chrome directly.');
    
    const browserPath = findBrowserPath();
    if (!browserPath) {
      console.error('\n⚠️  Browser path not found.');
      console.error('   Currently checked paths:');
      console.error(`   - Local: ${path.join(process.cwd(), 'chrome')}`);
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      if (homeDir) {
        console.error(`   - Cache: ${path.join(homeDir, '.cache', 'puppeteer', 'chrome')}`);
      }
    } else {
      console.error(`\n✅ Browser path found: ${browserPath}`);
    }
  }
  console.error('\nDetailed error:', error.message || error);
  if (error.stack) {
    console.error('\nStack trace:', error.stack);
  }
  process.exit(1);
} finally {
  if (browser) {
    await browser.close();
  }
}})();