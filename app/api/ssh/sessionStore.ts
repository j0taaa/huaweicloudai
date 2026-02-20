import { randomUUID } from "crypto";
import { Client, type ClientChannel, type ConnectConfig } from "ssh2";

type SshSession = {
  id: string;
  client: Client;
  stream: ClientChannel;
  buffer: string;
  bufferStart: number;
  nextReadIndex: number;
  createdAt: number;
  lastActivity: number;
};

type SshConnectInput = {
  host: string;
  port?: number;
  username: string;
  password: string;
};

const MAX_BUFFER_CHARS = 20000;
const sessions = new Map<string, SshSession>();

const appendBuffer = (session: SshSession, chunk: string) => {
  session.buffer += chunk;
  session.lastActivity = Date.now();
  if (session.buffer.length > MAX_BUFFER_CHARS) {
    const trimmedChars = session.buffer.length - MAX_BUFFER_CHARS;
    session.buffer = session.buffer.slice(-MAX_BUFFER_CHARS);
    session.bufferStart += trimmedChars;
    session.nextReadIndex = Math.max(session.nextReadIndex, session.bufferStart);
  }
};

export const createSession = async (input: SshConnectInput) => {
  const { host, port = 22, username, password } = input;

  return new Promise<{ sessionId: string }>((resolve, reject) => {
    const client = new Client();
    let resolved = false;

    client.on("ready", () => {
      client.shell(
        {
          term: "xterm-color",
          cols: 120,
          rows: 40,
        },
        (shellError: Error | undefined, stream: ClientChannel) => {
          if (shellError) {
            client.end();
            reject(shellError);
            return;
          }

          const sessionId = randomUUID();
          const session: SshSession = {
            id: sessionId,
            client,
            stream,
            buffer: "",
            bufferStart: 0,
            nextReadIndex: 0,
            createdAt: Date.now(),
            lastActivity: Date.now(),
          };

          sessions.set(sessionId, session);

          const onData = (data: Buffer | string) => {
            appendBuffer(session, data.toString());
          };

          stream.on("data", onData);
          if (stream.stderr) {
            stream.stderr.on("data", onData);
          }

          stream.on("close", () => {
            sessions.delete(sessionId);
            client.end();
          });

          client.on("close", () => {
            sessions.delete(sessionId);
          });

          resolved = true;
          resolve({ sessionId });
        },
      );
    });

    client.on("error", (error: Error) => {
      if (!resolved) {
        reject(error);
      }
    });

    const config: ConnectConfig = {
      host,
      port,
      username,
      password,
      readyTimeout: 15000,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3,
    };

    client.connect(config);
  });
};

export const getSession = (sessionId: string) => {
  return sessions.get(sessionId);
};

export const sendCommand = (sessionId: string, command: string, appendNewline: boolean) => {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error("SSH session not found.");
  }

  session.stream.write(appendNewline ? `${command}\n` : command);
  session.lastActivity = Date.now();
};

export const readBuffer = (sessionId: string, maxChars: number, clear: boolean) => {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error("SSH session not found.");
  }

  const unreadStartOffset = Math.max(session.nextReadIndex - session.bufferStart, 0);
  const unreadOutput = session.buffer.slice(unreadStartOffset);
  const output = unreadOutput.length > maxChars ? unreadOutput.slice(0, maxChars) : unreadOutput;

  session.nextReadIndex += output.length;

  if (clear) {
    session.buffer = "";
    session.bufferStart = session.nextReadIndex;
  }

  return output;
};

export const closeSession = (sessionId: string) => {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }
  session.stream.end();
  session.client.end();
  sessions.delete(sessionId);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const waitForOutput = async (
  sessionId: string,
  targetText: string,
  timeoutMs: number,
  pollIntervalMs: number,
  maxChars: number,
) => {
  const initialSession = sessions.get(sessionId);
  if (!initialSession) {
    throw new Error("SSH session not found.");
  }

  const waitTarget = targetText.trim();
  if (!waitTarget) {
    throw new Error("targetText is required.");
  }

  const waitStart = Date.now();
  const startIndex = initialSession.bufferStart + initialSession.buffer.length;

  while (Date.now() - waitStart <= timeoutMs) {
    const activeSession = sessions.get(sessionId);
    if (!activeSession) {
      throw new Error("SSH session not found.");
    }

    const startOffset = Math.max(startIndex - activeSession.bufferStart, 0);
    const outputSinceWait = activeSession.buffer.slice(startOffset);
    const output =
      outputSinceWait.length > maxChars
        ? outputSinceWait.slice(-maxChars)
        : outputSinceWait;

    if (output.includes(waitTarget)) {
      return {
        matched: true,
        output,
        waitedMs: Date.now() - waitStart,
      };
    }

    await sleep(pollIntervalMs);
  }

  const finalSession = sessions.get(sessionId);
  if (!finalSession) {
    throw new Error("SSH session not found.");
  }

  const finalStartOffset = Math.max(startIndex - finalSession.bufferStart, 0);
  const finalOutputSinceWait = finalSession.buffer.slice(finalStartOffset);
  const finalOutput =
    finalOutputSinceWait.length > maxChars
      ? finalOutputSinceWait.slice(-maxChars)
      : finalOutputSinceWait;

  return {
    matched: false,
    output: finalOutput,
    waitedMs: Date.now() - waitStart,
  };
};
