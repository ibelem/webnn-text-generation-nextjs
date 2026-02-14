/**
 * Incremental streaming parser for the OpenAI Harmony response format.
 * Adapted from the GPT-OSS-WebGPU demo for use in a Web Worker.
 *
 * @see https://developers.openai.com/cookbook/articles/openai-harmony.md
 */

const SPECIAL_TOKENS = {
  START: "<|start|>",
  END: "<|end|>",
  MESSAGE: "<|message|>",
  CHANNEL: "<|channel|>",
  CONSTRAIN: "<|constrain|>",
  RETURN: "<|return|>",
  CALL: "<|call|>",
};

const State = {
  IDLE: "IDLE",
  HEADER_ROLE: "HEADER_ROLE",
  HEADER_CHANNEL: "HEADER_CHANNEL",
  HEADER_CONSTRAIN: "HEADER_CONSTRAIN",
  CONTENT: "CONTENT",
};

export class HarmonyStreamParser {
  constructor() {
    this.messages = [];
    this._state = State.IDLE;
    this._buf = "";
    this._done = false;
  }

  get _current() {
    return this.messages.length > 0 ? this.messages[this.messages.length - 1] : undefined;
  }

  _newMessage(init) {
    const msg = {
      role: "",
      channel: "",
      content: "",
      endReason: "pending",
      ...(init || {}),
    };
    this.messages.push(msg);
    return {
      type: "new_message",
      messageIndex: this.messages.length - 1,
      message: { ...msg },
    };
  }

  _closeMessage(reason) {
    const msg = this._current;
    if (msg) {
      msg.content = msg.content.trimEnd();
      msg.endReason = reason;
    }
    this._state = State.IDLE;
    this._buf = "";
    return {
      type: "done",
      messageIndex: this.messages.length - 1,
      endReason: reason,
      isDone: reason === "return",
    };
  }

  _extractRecipient(text) {
    const match = text.match(/\bto=(\S+)/);
    if (match && this._current) {
      this._current.recipient = match[1];
      return text.replace(match[0], "").trim();
    }
    return text.trim();
  }

  push(token) {
    if (this._done) return null;

    switch (token) {
      case SPECIAL_TOKENS.START:
        this._buf = "";
        this._state = State.HEADER_ROLE;
        if (!this._current || this._current.endReason !== "pending") {
          return this._newMessage();
        }
        return null;

      case SPECIAL_TOKENS.CHANNEL:
        this._buf = "";
        this._state = State.HEADER_CHANNEL;
        if (!this._current || this._current.endReason !== "pending") {
          return this._newMessage({ role: "assistant" });
        }
        return null;

      case SPECIAL_TOKENS.CONSTRAIN:
        this._buf = "";
        this._state = State.HEADER_CONSTRAIN;
        return null;

      case SPECIAL_TOKENS.MESSAGE:
        this._buf = "";
        this._state = State.CONTENT;
        return null;

      case SPECIAL_TOKENS.END:
        return this._closeMessage("end");

      case SPECIAL_TOKENS.RETURN:
        this._done = true;
        return this._closeMessage("return");

      case SPECIAL_TOKENS.CALL:
        return this._closeMessage("call");
    }

    switch (this._state) {
      case State.HEADER_ROLE: {
        this._buf += token;
        const cleaned = this._extractRecipient(this._buf);
        if (this._current) this._current.role = cleaned;
        return null;
      }

      case State.HEADER_CHANNEL: {
        this._buf += token;
        const cleaned = this._extractRecipient(this._buf);
        if (this._current) this._current.channel = cleaned;
        return null;
      }

      case State.HEADER_CONSTRAIN: {
        this._buf += token;
        if (this._current) this._current.contentType = this._buf.trim();
        return null;
      }

      case State.CONTENT: {
        if (this._current) {
          this._current.content += token;
        }
        return {
          type: "content",
          messageIndex: this.messages.length - 1,
          textDelta: token,
        };
      }

      default:
        return null;
    }
  }

  pushMany(tokens) {
    const deltas = [];
    for (const token of tokens) {
      const d = this.push(token);
      if (d) deltas.push(d);
    }
    return deltas;
  }

  getResult() {
    return {
      messages: this.messages,
      done: this._done,
    };
  }

  reset() {
    this.messages = [];
    this._state = State.IDLE;
    this._buf = "";
    this._done = false;
  }
}
