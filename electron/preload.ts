import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { MargeXApi, OutputFormat, RenderProgress, StartRenderRequest } from '../shared/types';

const api: MargeXApi = {
  getHardwareInfo: () => ipcRenderer.invoke('margex:getHardwareInfo'),
  openMediaDialog: () => ipcRenderer.invoke('margex:openMediaDialog'),
  saveOutputDialog: (defaultName: string, format: OutputFormat) =>
    ipcRenderer.invoke('margex:saveOutputDialog', defaultName, format),
  resolveAutoOutputPath: (sourceFilePath: string, format: OutputFormat) =>
    ipcRenderer.invoke('margex:resolveAutoOutputPath', sourceFilePath, format),
  getPlayableVideoUrl: (filePath: string, forceTranscode = false) =>
    ipcRenderer.invoke('margex:getPlayableVideoUrl', filePath, forceTranscode),
  probeFiles: (filePaths: string[]) => ipcRenderer.invoke('margex:probeFiles', filePaths),
  startRender: (req: StartRenderRequest) => ipcRenderer.invoke('margex:startRender', req),
  cancelRender: () => ipcRenderer.invoke('margex:cancelRender'),
  revealInFolder: (filePath: string) => ipcRenderer.invoke('margex:revealInFolder', filePath),
  openFile: (filePath: string) => ipcRenderer.invoke('margex:openFile', filePath),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  onRenderProgress: (callback: (progress: RenderProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: RenderProgress) => {
      callback(progress);
    };
    ipcRenderer.on('margex:renderProgress', listener);
    return () => {
      ipcRenderer.removeListener('margex:renderProgress', listener);
    };
  },
};

contextBridge.exposeInMainWorld('margex', api);
