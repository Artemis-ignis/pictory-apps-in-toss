import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  PictoryUsageAccount,
  PictoryUsageLedgerStore,
} from "./pictoryUsageLedger";

interface LedgerFile {
  accounts?: Record<string, PictoryUsageAccount>;
}

export class PictoryFileUsageLedgerStore implements PictoryUsageLedgerStore {
  constructor(private readonly filePath: string) {}

  async readAccount(subjectId: string) {
    const ledger = await this.readLedger();
    return ledger.accounts?.[subjectId] ?? null;
  }

  async writeAccount(account: PictoryUsageAccount) {
    const ledger = await this.readLedger();
    const accounts = ledger.accounts ?? {};
    accounts[account.subjectId] = account;
    await this.writeLedger({ accounts });
  }

  async deleteAccount(subjectId: string) {
    const ledger = await this.readLedger();
    const accounts = { ...(ledger.accounts ?? {}) };
    const deleted = Object.prototype.hasOwnProperty.call(accounts, subjectId);
    delete accounts[subjectId];
    await this.writeLedger({ accounts });
    return deleted;
  }

  private async readLedger(): Promise<LedgerFile> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as LedgerFile;
      return isLedgerFile(parsed) ? parsed : { accounts: {} };
    } catch (error) {
      if (isNotFoundError(error)) {
        return { accounts: {} };
      }
      throw error;
    }
  }

  private async writeLedger(ledger: LedgerFile) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
    await rename(tempPath, this.filePath);
  }
}

function isLedgerFile(value: unknown): value is LedgerFile {
  return typeof value === "object" && value !== null;
}

function isNotFoundError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
