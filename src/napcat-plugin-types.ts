import type { NapCatContextLike } from './adapters/napcat-adapter.ts';
import type { LoggerLike } from './types.ts';

export interface PluginConfigItem {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'multi-select' | 'html' | 'text';
  label: string;
  description?: string;
  default?: unknown;
  options?: Array<{ label: string; value: string | number }>;
  placeholder?: string;
  reactive?: boolean;
  hidden?: boolean;
}

export type PluginConfigSchema = PluginConfigItem[];

export interface NapCatConfigLike {
  text(
    key: string,
    label: string,
    defaultValue?: string,
    description?: string,
    reactive?: boolean,
  ): PluginConfigItem;
  number(
    key: string,
    label: string,
    defaultValue?: number,
    description?: string,
    reactive?: boolean,
  ): PluginConfigItem;
  boolean(
    key: string,
    label: string,
    defaultValue?: boolean,
    description?: string,
    reactive?: boolean,
  ): PluginConfigItem;
  select(
    key: string,
    label: string,
    options: Array<{ label: string; value: string | number }>,
    defaultValue?: string | number,
    description?: string,
    reactive?: boolean,
  ): PluginConfigItem;
  combine(...items: PluginConfigItem[]): PluginConfigSchema;
}

export interface NapCatPluginContext extends NapCatContextLike {
  configPath: string;
  NapCatConfig: NapCatConfigLike;
  logger: LoggerLike;
}

export interface PluginModule {
  plugin_init: (ctx: NapCatPluginContext) => void | Promise<void>;
  plugin_onmessage?: (
    ctx: NapCatPluginContext,
    event: unknown,
  ) => void | Promise<void>;
  plugin_cleanup?: (ctx: NapCatPluginContext) => void | Promise<void>;
  plugin_get_config?: (ctx: NapCatPluginContext) => unknown | Promise<unknown>;
  plugin_set_config?: (
    ctx: NapCatPluginContext,
    config: unknown,
  ) => void | Promise<void>;
  plugin_on_config_change?: (
    ctx: NapCatPluginContext,
    ui: unknown,
    key: string,
    value: unknown,
    currentConfig: Record<string, unknown>,
  ) => void | Promise<void>;
}
