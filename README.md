# ThorVG Test Automation

ThorVG Test Automation is rendering test tool for ThorVG Engine. It works as both GUI and CLI, detects rendering error by comparing canvas bitmap, automatically.

https://github.com/tinyjin/thorvg.tester/assets/11167117/b4df338a-d4e1-4671-b1ca-c4ccc1fdf3ec



# Usage

## GUI
Click to use [ThorVG Tester](https://thorvg-test-automation.vercel.app)

## CLI
```sh
git clone git@github.com:thorvg/thorvg.test-automation.git
cd thorvg.test-automation
npm i -g ./cli

tvg-cli /path/to/target-dir
open result.pdf # Optional: open summarized PDF
```

```
Options:
    -E  Run automatic classification after test
    -D  Debug Mode, test with GUI, CLI at same time
    -V  Verbose, log all

    Target:
        The directory path where `.json` files are located,
        at least one of valid lottie json has to be provided.
```

## Review with PDF

When test is done, system will provide you with PDF that includes test results, you can simply check and review.
- GUI : Will automatically open PDF on new tab
- CLI : Generates `result.pdf` in your current directory

![pdf-example](./docs/pdf-example.png)

## Others

[ThorVG Project](https://github.com/thorvg/thorvg)
