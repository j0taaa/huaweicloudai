import { randomUUID } from "crypto";
import { Client, type ClientChannel, type ConnectConfig } from "ssh2";

type SshSession = {
  id: string;
  client: Client;
  stream: ClientChannel;
  buffer: string;
  readCursor: number;
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
    const overflow = session.buffer.length - MAX_BUFFER_CHARS;
    session.buffer = session.buffer.slice(overflow);
    session.readCursor = Math.max(0, session.readCursor - overflow);
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
            readCursor: 0,
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
  session.readCursor = session.buffer.length;
  session.lastActivity = Date.now();
};

export const readBuffer = (sessionId: string, maxChars: number, clear: boolean) => {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error("SSH session not found.");
  }

  const unreadOutput = session.buffer.slice(session.readCursor);
  const output =
    unreadOutput.length > maxChars
      ? unreadOutput.slice(-maxChars)
      : unreadOutput;

  session.readCursor = session.buffer.length;

  if (clear) {
    session.buffer = "";
    session.readCursor = 0;
  }

  return output;
};

const normalizeLine = (line: string) => line.replace(/\u001b\[[0-9;]*m/g, "").trim();

const getLastNonEmptyLine = (value: string) => {
  const lines = value
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => normalizeLine(line))
    .filter((line) => line.length > 0);
  return lines.length ? lines[lines.length - 1] : "";
};

type WaitForDoneInput = {
  sessionId: string;
  doneText?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
};

export const waitForDone = async ({
  sessionId,
  doneText = "Done",
  timeoutMs = 120000,
  pollIntervalMs = 1000,
}: WaitForDoneInput) => {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error("SSH session not found.");
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const lastLine = getLastNonEmptyLine(session.buffer);
    if (lastLine === doneText) {
      return { done: true, lastLine };
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return {
    done: false,
    lastLine: getLastNonEmptyLine(session.buffer),
    error: `Timed out waiting for \"${doneText}\" after ${timeoutMs}ms.`,
  };
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
