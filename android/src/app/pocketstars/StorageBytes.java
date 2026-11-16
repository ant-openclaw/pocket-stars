package app.pocketstars;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** Shared UTF-8 byte bound for native storage and backups. */
final class StorageBytes {
    static final int MAX_BYTES = 16 * 1024 * 1024;

    private StorageBytes() {}

    static byte[] encodeChecked(String json) throws IOException {
        if (json == null) throw new IOException("Missing data");
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_BYTES) throw new IOException("Oversized data");
        return bytes;
    }
}
