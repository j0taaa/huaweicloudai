import { randomUUID } from "crypto";
import { Client, type ClientChannel, type ConnectConfig } from "ssh2";

type SshSession = {
  id: string;
  client: Client;
  stream: ClientChannel;
  buffer: string;
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
    session.buffer = session.buffer.slice(-MAX_BUFFER_CHARS);
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

  const output =
    session.buffer.length > maxChars
      ? session.buffer.slice(-maxChars)
      : session.buffer;

  if (clear) {
    session.buffer = "";
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
