const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron')
const path = require('path')

function createWindow () {
  const mainWindow = new BrowserWindow({
    width: 340,
    height: 720,
    alwaysOnTop: true,        // Keeps it above the game
    frame: false,             // Removes the OS window borders/titlebar
    transparent: true,        // Allows the background to be transparent
    opacity: 0.9,             // Start translucent (highly visible)
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  ipcMain.on('set-opacity', (event, opacity) => {
    mainWindow.setOpacity(opacity)
  })

  ipcMain.on('resize-window', (event, { width, height }) => {
    mainWindow.setSize(width, height, true)
  })

  ipcMain.on('move-window', (event, { x, y }) => {
    mainWindow.setPosition(x, y)
  })

  // Load the Vite dev server URL
  mainWindow.loadURL('http://localhost:5173')

  // Optional: Make the window ignore mouse clicks so you can click *through* it 
  // to play the game, except when hovering over the overlay elements.
  // mainWindow.setIgnoreMouseEvents(true, { forward: true })

  // Register a keyboard shortcut to exit the overlay quickly (Ctrl+Q or Cmd+Q)
  globalShortcut.register('CommandOrControl+Q', () => {
    app.quit()
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})
