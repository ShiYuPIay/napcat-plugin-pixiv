import type {
  BotAdapter,
  ForwardNode,
  Id,
  LoggerLike,
  MessageSegment,
} from '../types.ts';

interface NapCatActionsLike {
  call(
    action: string,
    params: unknown,
    adapterName: string,
    networkConfig: unknown,
  ): Promise<unknown>;
}

export interface NapCatContextLike {
  actions: NapCatActionsLike;
  adapterName: string;
  pluginManager: { config: unknown };
  logger?: LoggerLike;
}

export class NapCatAdapter implements BotAdapter {
  constructor(private readonly ctx: NapCatContextLike) {}

  private async call(action: string, params: unknown): Promise<void> {
    await this.ctx.actions.call(
      action,
      params,
      this.ctx.adapterName,
      this.ctx.pluginManager.config,
    );
  }

  async sendGroupMessage(
    groupId: Id,
    message: string | MessageSegment[],
  ): Promise<void> {
    await this.call('send_group_msg', {
      group_id: String(groupId),
      message,
    });
  }

  async sendGroupForwardMessage(
    groupId: Id,
    nodes: ForwardNode[],
  ): Promise<void> {
    await this.call('send_group_forward_msg', {
      group_id: String(groupId),
      messages: nodes,
    });
  }
}
