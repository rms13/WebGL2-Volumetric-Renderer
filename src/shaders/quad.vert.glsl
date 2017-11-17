#version 300 es
precision highp float;

in vec3 a_position;

out vec2 v_uv;

void main() {
    gl_Position = vec4(a_position, 1.0);
    v_uv = a_position.xy * 0.5 + 0.5;
}