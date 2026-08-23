import { promises as fs, existsSync } from "node:fs";
import * as path from "node:path";

export class LocalStorageProvider {
  private baseDir: string;

  constructor() {
    const envPath = process.env["STORAGE_LOCAL_PATH"];
    if (envPath && envPath !== "/data/storage") {
      this.baseDir = envPath;
    } else {
      try {
        if (existsSync("/data/storage")) {
          this.baseDir = "/data/storage";
        } else {
          this.baseDir = path.resolve(process.cwd(), ".localdev/storage");
        }
      } catch {
        this.baseDir = path.resolve(process.cwd(), ".localdev/storage");
      }
    }
  }

  private resolvePath(bucket: string, filePath: string): string {
    const cleanBucket = bucket.replace(/[^a-zA-Z0-9_-]/g, "_");
    const cleanPath = filePath.replace(/^\/+/, "");
    return path.join(this.baseDir, cleanBucket, cleanPath);
  }

  async upload(
    bucket: string,
    filePath: string,
    data: Buffer | Uint8Array,
    _contentType: string = "application/octet-stream",
  ): Promise<{ path: string; size: number }> {
    const targetPath = this.resolvePath(bucket, filePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, Buffer.from(data));
    return { path: filePath, size: data.length };
  }

  async download(bucket: string, filePath: string): Promise<Buffer> {
    const targetPath = this.resolvePath(bucket, filePath);
    return fs.readFile(targetPath);
  }

  async exists(bucket: string, filePath: string): Promise<boolean> {
    const targetPath = this.resolvePath(bucket, filePath);
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  async delete(bucket: string, filePaths: string[]): Promise<void> {
    for (const fp of filePaths) {
      const targetPath = this.resolvePath(bucket, fp);
      try {
        await fs.unlink(targetPath);
      } catch (err) {
        // Ignore missing file errors on delete
      }
    }
  }

  getUrl(bucket: string, filePath: string): string {
    const cleanPath = filePath.replace(/^\/+/, "");
    const baseUrl = process.env["VITE_APP_URL"] || "http://yearbook-manager.test";
    return `${baseUrl}/api/storage/${bucket}/${cleanPath}`;
  }
}

export const localStorageProvider = new LocalStorageProvider();
