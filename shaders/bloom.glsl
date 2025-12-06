// Bloom shader - creates glow effect on bright areas
// Adapted from hyper-mix

vec4 hook() {
    vec4 color = HOOKED_texOff(0);

    // Sample surrounding pixels for blur
    vec4 blur = vec4(0.0);
    float total = 0.0;

    for (int x = -2; x <= 2; x++) {
        for (int y = -2; y <= 2; y++) {
            float weight = 1.0 / (1.0 + float(abs(x) + abs(y)));
            blur += HOOKED_texOff(vec2(float(x), float(y))) * weight;
            total += weight;
        }
    }
    blur /= total;

    // Extract bright areas
    vec3 bright = max(blur.rgb - 0.5, 0.0) * 2.0;

    // Blend bloom with original
    float amount = 0.4;
    color.rgb = mix(color.rgb, 1.0 - ((1.0 - color.rgb) * (1.0 - bright)), amount);

    return color;
}
