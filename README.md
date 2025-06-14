NOTE Regarding the powershell scripts
Powershell scripts will be killed if the server is killed (Powershell apparently doesn't function when not attached to a console) however batch scripts are detached from the parent nodejs instance
https://github.com/nodejs/node-v0.x-archive/issues/8795

shell : true && detached : true -> will work but the terminal will popup

2.

```
npm install better-sqlite3
npm ERR! code 1
npm ERR! path D:\Personal\Work\Upwork\Windows-Scripts-WebApp\backend\node_modules\better-sqlite3
npm ERR! command failed
npm ERR! command C:\WINDOWS\system32\cmd.exe /d /s /c prebuild-install || node-gyp rebuild --release
npm ERR! prebuild-install warn install No prebuilt binaries found (target=21.6.1 runtime=node arch=x64 libc= platform=win32)
npm ERR! gyp info it worked if it ends with ok
npm ERR! gyp info using node-gyp@10.0.1
npm ERR! gyp info using node@21.6.1 | win32 | x64
npm ERR! gyp info find Python using Python version 3.11.9 found at "C:\Users\MOHAMED\AppData\Local\Microsoft\WindowsApps\PythonSoftwareFoundation.Python.3.11_qbz5n2kfra8p0\python.exe"
npm ERR! gyp ERR! find VS
npm ERR! gyp ERR! find VS msvs_version not set from command line or npm config
npm ERR! gyp ERR! find VS VCINSTALLDIR not set, not running in VS Command Prompt
npm ERR! gyp ERR! find VS could not use PowerShell to find Visual Studio 2017 or newer, try re-running with '--loglevel silly' for more details
npm ERR! gyp ERR! find VS not looking for VS2015 as it is only supported up to Node.js 18
npm ERR! gyp ERR! find VS not looking for VS2013 as it is only supported up to Node.js 8
npm ERR! gyp ERR! find VS
npm ERR! gyp ERR! find VS **************************************************************
npm ERR! gyp ERR! find VS You need to install the latest version of Visual Studio
npm ERR! gyp ERR! find VS including the "Desktop development with C++" workload.
npm ERR! gyp ERR! find VS For more information consult the documentation at:
npm ERR! gyp ERR! find VS https://github.com/nodejs/node-gyp#on-windows
npm ERR! gyp ERR! find VS **************************************************************
npm ERR! gyp ERR! find VS
npm ERR! gyp ERR! configure error
npm ERR! gyp ERR! stack Error: Could not find any Visual Studio installation to use
npm ERR! gyp ERR! stack at VisualStudioFinder.fail (C:\Users\MOHAMED\AppData\Roaming\npm\node_modules\npm\node_modules\node-gyp\lib\find-visualstudio.js:113:11)
npm ERR! gyp ERR! stack at VisualStudioFinder.findVisualStudio (C:\Users\MOHAMED\AppData\Roaming\npm\node_modules\npm\node_modules\node-gyp\lib\find-visualstudio.js:69:17)
npm ERR! gyp ERR! stack at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
npm ERR! gyp ERR! stack at async createBuildDir (C:\Users\MOHAMED\AppData\Roaming\npm\node_modules\npm\node_modules\node-gyp\lib\configure.js:69:26)
npm ERR! gyp ERR! stack at async run (C:\Users\MOHAMED\AppData\Roaming\npm\node_modules\npm\node_modules\node-gyp\bin\node-gyp.js:81:18)
npm ERR! gyp ERR! System Windows_NT 10.0.26100
npm ERR! gyp ERR! command "C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\MOHAMED\\AppData\\Roaming\\npm\\node_modules\\npm\\node_modules\\node-gyp\\bin\\node-gyp.js" "rebuild" "--release"
npm ERR! gyp ERR! cwd D:\Personal\Work\Upwork\Windows-Scripts-WebApp\backend\node_modules\better-sqlite3
npm ERR! gyp ERR! node -v v21.6.1
npm ERR! gyp ERR! node-gyp -v v10.0.1
npm ERR! gyp ERR! not ok

npm ERR! A complete log of this run can be found in: C:\Users\MOHAMED\AppData\Local\npm-cache\_logs\2025-06-03T09_45_20_407Z-debug-0.log
```

C:\Program Files\nodejs\install_tools.bat
