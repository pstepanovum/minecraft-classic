// ==============================================================
// FILE: research/src/ml/websocket-client.js
// ==============================================================

export class PPOWebSocketClient {
  constructor(url = "ws://localhost:8765") {
    this.url = url;
    this.ws = null;
    this.connected = false;
    this.messageQueue = [];
    this.pendingResponse = null;
    this.responsePromise = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.connected = true;

          this.send({ type: "ready" });

          while (this.messageQueue.length > 0) {
            const msg = this.messageQueue.shift();
            this.ws.send(JSON.stringify(msg));
          }

          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          reject(error);
        };

        this.ws.onclose = () => {
          this.connected = false;
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data);

      if (this.responsePromise) {
        this.responsePromise.resolve(message);
        this.responsePromise = null;
      }
    } catch (error) {}
  }

  send(data) {
    const message = JSON.stringify(data);

    if (this.connected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      this.messageQueue.push(data);
    }
  }

  sendAndWait(data, timeout = 5000) {
    return new Promise((resolve, reject) => {
      this.responsePromise = { resolve, reject };

      this.send(data);

      setTimeout(() => {
        if (this.responsePromise) {
          this.responsePromise.reject(new Error("Response timeout"));
          this.responsePromise = null;
        }
      }, timeout);
    });
  }

  async resetEpisode(episode) {
    const response = await this.sendAndWait({
      type: "reset",
      episode: episode,
    });

    return response;
  }

  async getActions(observations) {
    const response = await this.sendAndWait(
      {
        type: "observation",
        agents: observations,
      },
      10000
    );

    return response;
  }

  sendStepResult(stepData) {
    this.send({
      type: "step_result",
      ...stepData,
    });
  }

  sendEpisodeComplete(episode, stats) {
    this.send({
      type: "episode_complete",
      episode: episode,
      stats: stats,
    });
  }

  sendError(message, details) {
    this.send({
      type: "error",
      message: message,
      details: details,
    });
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }

  isConnected() {
    return this.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

export default PPOWebSocketClient;
