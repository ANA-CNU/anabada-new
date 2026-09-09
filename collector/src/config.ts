import { z } from "zod";
import type { AccountId } from "./domain/sync.js";
import { BoundaryError } from "./errors.js";

const secretSchema = z.string().min(1).brand("Secret");
const emergencyWebhookUrlSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z
    .string()
    .url()
    .refine((value) => value.startsWith("https://"))
    .brand("EmergencyWebhookUrl")
    .optional(),
);
const environmentSchema = z.object({
  DB_PASSWORD: secretSchema,
  JUNGOL_USERNAME: secretSchema,
  JUNGOL_PASSWORD: secretSchema,
  WEBHOOK_URL: emergencyWebhookUrlSchema,
});
export type Credentials = {
  readonly username: z.infer<typeof secretSchema>;
  readonly password: z.infer<typeof secretSchema>;
  readonly databasePassword: z.infer<typeof secretSchema>;
};
export type CollectorSettings = {
  readonly database: {
    readonly host: string;
    readonly port: number;
    readonly user: string;
    readonly name: string;
  };
  readonly baseUrl: string;
  readonly groupId: number;
  readonly profileDir: string;
  readonly intervalMs: number;
  readonly concurrency: number;
  readonly maxPages: number;
  readonly headless: boolean;
  readonly loginTimeoutMs: number;
  readonly pageTimeoutMs: number;
  readonly randomSeed: string;
  readonly targetAccountId: AccountId | undefined;
  readonly runOnce: boolean;
};
const productionSettings: CollectorSettings = Object.freeze({
  database: Object.freeze({
    host: "anabada-mysql",
    port: 3306,
    user: "root",
    name: "jungol_bada",
  }),
  baseUrl: "https://jungol.co.kr",
  groupId: 1125,
  profileDir: "/var/lib/jungol/profile",
  intervalMs: 600000,
  concurrency: 2,
  maxPages: 100,
  headless: true,
  loginTimeoutMs: 60000,
  pageTimeoutMs: 30000,
  randomSeed: "anabada",
  targetAccountId: undefined,
  runOnce: false,
});
export type CollectorConfig = CollectorSettings & {
  readonly credentials: Credentials;
  readonly emergencyWebhookUrl: z.infer<typeof emergencyWebhookUrlSchema>;
};

export class CollectorConfigLoader {
  readonly settings: CollectorSettings;

  constructor(settings: Partial<CollectorSettings> = {}) {
    this.settings = Object.freeze({ ...productionSettings, ...settings });
  }

  parse(input: unknown): CollectorConfig {
    const parsed = environmentSchema.safeParse(input);
    if (!parsed.success) throw new BoundaryError("invalid_config");
    return Object.freeze({
      ...this.settings,
      credentials: Object.freeze({
        username: parsed.data.JUNGOL_USERNAME,
        password: parsed.data.JUNGOL_PASSWORD,
        databasePassword: parsed.data.DB_PASSWORD,
      }),
      emergencyWebhookUrl: parsed.data.WEBHOOK_URL,
    });
  }
}
