import {contextBridge, ipcRenderer} from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (message: string) => ipcRenderer.send('message', message),
  
  // tRPC 调用
  trpc: {
    query: (path: string, input?: any) => 
      ipcRenderer.invoke('trpc', { path, input, type: 'query' }),
    mutate: (path: string, input?: any) => 
      ipcRenderer.invoke('trpc', { path, input, type: 'mutation' }),
  }
})
