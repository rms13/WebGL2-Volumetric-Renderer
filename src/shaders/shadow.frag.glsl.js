export default function(params) {
return `#version 300 es
precision highp float;

in vec3 v_position;

out vec4 out_Color;

void main() {
    // Bitshifting allows for higher precision FPN. 
    // Store parts of the FPN in each of the RGB channels.
    // This helps avoid banding.
    const vec4 bitShift = vec4( 1.0, 
                                256.0, 
                                256.0 * 256.0, 
                                256.0 * 256.0 * 256.0);
    const vec4 bitMask = vec4(  1.0 / 256.0, 
                                1.0 / 256.0, 
                                1.0 / 256.0, 
                                0.0);

    // Calculate the value stored into each byte
    vec4 rgbaDepth = fract(v_position.z * bitShift);

    // Cut off the value which do not fit in 8 bits
    rgbaDepth -= rgbaDepth.gbaa * bitShift;

    // Store the depth into the shadow map
    out_Color = vec4(gl_FragCoord.z, 0.0,0.0,1.0);
}
`;
}
