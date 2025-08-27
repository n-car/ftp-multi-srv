import { EventEmitter } from 'events';

export interface FtpUser { username: string; password: string; }
export interface ShareDefinition {
  name: string;
  path: string;
  public?: boolean;
  anonymousPermission?: 'r' | 'rw';
  maxSizeBytes?: number | null;
  users?: Record<string, 'r' | 'rw'>;
}
export interface ServerLimits { maxUploadBytes?: number | null; }
export interface ServerAnonymous { enabled?: boolean; }
export interface ServerPasv { enabled?: boolean; url?: string; min?: number; max?: number; }
export interface ServerTls { enabled?: boolean; mode?: 'explicit' | 'implicit'; cert?: string; key?: string; }
export interface ServerConfig {
  host?: string;
  port?: number;
  anonymous?: ServerAnonymous;
  limits?: ServerLimits;
  pasv?: ServerPasv;
  tls?: ServerTls;
  locale?: string;
  fallbackLocale?: string;
  [k: string]: any;
}
export interface CreateServerOptions {
  users: FtpUser[];
  shares: ShareDefinition[];
  serverConf: ServerConfig;
  logger?: Console;
  validate?: boolean;
}
export interface CreateServerResult {
  ftpServer: EventEmitter & { listen: () => Promise<any>; close: () => Promise<any>; options: any; };
  shareMap: Record<string, any>;
  userMap: Map<string, FtpUser>;
  defaultLocale: string;
  fallbackLocale: string;
}
export function createFtpServer(opts: CreateServerOptions): CreateServerResult;
