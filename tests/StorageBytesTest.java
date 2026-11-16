package app.pocketstars;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** Run with the project JDK against the production StorageBytes helper; no Android needed. */
public final class StorageBytesTest {
    private static int passed;
    private static int failed;

    public static void main(String[] args) throws Exception {
        if (StorageBytes.MAX_BYTES != 16 * 1024 * 1024) {
            throw new AssertionError("Reader/writer bound must remain 16 MiB");
        }
        for (String token : new String[]{"a", "\u00e9", "\ud83d\ude00"}) {
            String label = token.equals("a") ? "ASCII" : token.equals("\u00e9") ? "nonASCII" : "emoji";
            for (int delta : new int[]{-1, 0, 1}) {
                check(label, payload(token, StorageBytes.MAX_BYTES + delta), delta <= 0);
            }
        }
        try {
            StorageBytes.encodeChecked(null);
            fail("null accepted");
        } catch (IOException expected) {
            pass("null rejected");
        }
        System.out.println("StorageBytesTest: " + passed + " passed, " + failed + " failed");
        if (failed != 0) throw new AssertionError("Storage byte boundary regression");
    }

    private static String payload(String token, int bytes) {
        StringBuilder json = new StringBuilder();
        json.append("{\"v\":\"");
        int remaining = bytes - 8;
        int width = token.getBytes(StandardCharsets.UTF_8).length;
        for (int i = 0; i < remaining / width; i++) json.append(token);
        for (int i = 0; i < remaining % width; i++) json.append('a');
        json.append("\"}");
        if (json.toString().getBytes(StandardCharsets.UTF_8).length != bytes) {
            throw new AssertionError("Incorrect test fixture byte size");
        }
        return json.toString();
    }

    private static void check(String label, String json, boolean allowed) throws Exception {
        int expectedSize = json.getBytes(StandardCharsets.UTF_8).length;
        String name = label + " " + expectedSize + " bytes";
        try {
            byte[] encoded = StorageBytes.encodeChecked(json);
            if (!allowed) { fail(name + " accepted above reader bound"); return; }
            if (encoded.length > StorageBytes.MAX_BYTES || encoded.length != expectedSize
                    || !new String(encoded, StandardCharsets.UTF_8).equals(json)) {
                fail(name + " cannot round-trip within reader bound"); return;
            }
            pass(name + " round-trips within reader bound");
        } catch (IOException e) {
            if (allowed) fail(name + " unexpectedly rejected");
            else pass(name + " rejected");
        }
    }

    private static void pass(String message) { passed++; System.out.println("PASS " + message); }
    private static void fail(String message) { failed++; System.out.println("FAIL " + message); }
}
