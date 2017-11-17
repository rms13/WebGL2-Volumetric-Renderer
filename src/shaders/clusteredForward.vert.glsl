#version 300 es
precision highp float;

uniform mat4 u_viewProjectionMatrix;

in vec3 a_position;
in vec3 a_normal;
in vec2 a_uv;

out vec3 v_position;
out vec3 v_normal;
out vec2 v_uv;

void main() {
    gl_Position = u_viewProjectionMatrix * vec4(a_position, 1.0);
    v_position = a_position;
    v_normal = a_normal;
    v_uv = a_uv;
}
