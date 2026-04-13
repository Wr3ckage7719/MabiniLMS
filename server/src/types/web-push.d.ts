declare module 'web-push' {
  export interface WebPushSubscription {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  }

  export interface SendOptions {
    TTL?: number;
    [key: string]: unknown;
  }

  const webpush: {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    sendNotification(
      subscription: WebPushSubscription,
      payload?: string,
      options?: SendOptions
    ): Promise<unknown>;
  };

  export default webpush;
}