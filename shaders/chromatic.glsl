// Chromatic aberration shader - RGB channel separation
// Creates a retro/glitch aesthetic

vec4 hook() {
    vec2 uv = HOOKED_pos;
    vec2 center = vec2(0.5, 0.5);

    // Distance from center for aberration strength
    vec2 dir = uv - center;
    float dist = length(dir);

    // Aberration amount (stronger at edges)
    float amount = dist * 0.008;

    // Sample RGB channels with offset
    float r = HOOKED_tex(uv + dir * amount).r;
    float g = HOOKED_tex(uv).g;
    float b = HOOKED_tex(uv - dir * amount).b;

    return vec4(r, g, b, 1.0);
}
