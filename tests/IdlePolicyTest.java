package app.pocketstars;

/** JVM tests exercise the production policy without Android or a mock clock. */
public final class IdlePolicyTest {
    private static int checks;
    private static void check(boolean ok, String message) {
        checks++;
        if (!ok) throw new AssertionError(message);
    }
    public static void main(String[] args) {
        IdlePolicy idle = new IdlePolicy();
        idle.resume(100);
        check(IdlePolicy.TIMEOUT_MS == 300000L, "five minutes is 300000ms");
        check(idle.remaining(100) == 300000L, "deadline starts on resume");
        check(!idle.expire(300099), "must not blank before deadline");
        check(idle.expire(300100), "must blank at exact deadline");
        check(idle.isIdle(), "deadline enters idle state");
        idle.resume(400000);
        idle.interaction(500000);
        check(!idle.expire(700000), "interaction resets the old deadline");
        check(idle.remaining(500001) == 299999, "reset uses full five minutes");
        check(idle.expire(800000), "reset deadline still expires exactly");
        check(idle.touch(800001, true, false), "wake DOWN consumed");
        check(!idle.isIdle(), "single DOWN wakes instantly");
        check(idle.touch(800002, false, false), "wake MOVE and extra pointers consumed");
        check(idle.touch(800003, false, true), "wake UP consumed, never clicks a button");
        check(!idle.touch(800004, true, false), "next gesture reaches app");
        check(!idle.touch(800005, false, true), "normal UP reaches app");
        check(idle.remaining(800005) == 300000, "normal gesture resets deadline");
        check(idle.expire(1100005), "idle again");
        idle.interaction(1100006);
        check(idle.isIdle(), "generic interaction cannot silently unblank");
        check(idle.touch(1100007, true, false), "second wake consumed");
        check(idle.touch(1100008, false, true), "CANCEL consumed like UP");
        check(!idle.touch(1100009, true, false), "cancel releases consumption");
        check(!idle.touch(1100010, false, true), "normal gesture completes");
        idle.resume(1200000);
        check(!idle.isIdle(), "resume clears idle state");
        check(!idle.expire(1499999), "resume starts fresh deadline");
        check(idle.expire(1500000), "second resumed deadline expires");
        check(idle.touch(1500001, true, false), "start interrupted wake");
        idle.resume(1600000);
        check(!idle.touch(1600001, true, false), "resume discards an interrupted old gesture");
        System.out.println("IdlePolicy: " + checks + " checks passed");
    }
}
