import { getOptions } from "@/lib/admin-db";

const optionMap = () => new Map(getOptions().map((entry) => [entry.key, entry.value]));

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

export type AppConfig = {
  loginEnabled: boolean;
  builtInInferenceEnabled: boolean;
  builtInInference: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
};

export const getAppConfig = (): AppConfig => {
  const options = optionMap();

  const envBaseUrl = process.env.ZAI_URL?.trim() ?? "";
  const envApiKey = process.env.ZAI_APIKEY?.trim() ?? "";
  const envModel = process.env.ZAI_MODEL?.trim() ?? "glm-4.7";

  const baseUrl = options.get("inference.builtin.baseUrl")?.trim() || envBaseUrl;
  const apiKey = options.get("inference.builtin.apiKey")?.trim() || envApiKey;
  const model = options.get("inference.builtin.model")?.trim() || envModel;

  const builtInAvailable = Boolean(baseUrl && apiKey && model);

  return {
    loginEnabled: parseBoolean(options.get("auth.enabled"), false),
    builtInInferenceEnabled: parseBoolean(options.get("inference.builtin.enabled"), builtInAvailable),
    builtInInference: {
      baseUrl,
      apiKey,
      model,
    },
  };
};
