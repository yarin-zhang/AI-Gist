/**
 * Should match main/preload.ts for typescript support in renderer
 */
export default interface ElectronApi {
  sendMessage: (message: string) => void
  
  // tRPC 通信
  trpc: {
    query: (path: string, input?: any) => Promise<any>
    mutate: (path: string, input?: any) => Promise<any>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronApi,
  }
}
