package app.pocketstars;

/** Monotonic-clock idle deadline. Android supplies uptimeMillis, tests supply times. */
final class IdlePolicy {
    static final long TIMEOUT_MS = 300000L;
    private long deadline;
    private boolean idle;
    private boolean consumingWake;

    /** Consume every event in the waking gesture, including its final UP/CANCEL. */
    boolean touch(long now, boolean down, boolean finished) {
        if (idle) {
            if (!down) return true;
            idle = false;
            consumingWake = true;
        }
        boolean consumed = consumingWake;
        if (finished) consumingWake = false;
        interaction(now);
        return consumed;
    }

    void resume(long now) {
        idle = false;
        consumingWake = false;
        deadline = now + TIMEOUT_MS;
    }

    void interaction(long now) {
        if (!idle) deadline = now + TIMEOUT_MS;
    }

    long remaining(long now) { return Math.max(0L, deadline - now); }
    boolean isIdle() { return idle; }

    boolean expire(long now) {
        if (idle || now < deadline) return false;
        idle = true;
        return true;
    }
}
