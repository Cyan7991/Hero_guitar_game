export { RNG }

abstract class RNG {
    // LCG using GCC's constants
    private static m = 0x80000000; // 2**31
    private static a = 1103515245;
    private static c = 12345;

    /**
     * Call `hash` repeatedly to generate the sequence of hashes.
     * @param seed
     * @returns a hash of the seed
     */
    public static hash = (seed: number) => (RNG.a * seed + RNG.c) % RNG.m;

    /**
     h    * Takes hash value and scales it to the range [-1, 1]
     */
    public static scale = (hash: number) => (((2 * hash) / (RNG.m - 1) - 1)+1)/2;
}