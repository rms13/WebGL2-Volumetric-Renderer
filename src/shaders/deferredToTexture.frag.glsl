#version 300 es
precision highp float;

uniform sampler2D u_colmap;
uniform sampler2D u_normap;

uniform mat4 u_viewMatrix;

in vec3 v_position;
in vec3 v_normal;
in vec2 v_uv;

out vec4 fragData[3];

vec3 applyNormalMap(vec3 geomnor, vec3 normap) {
    normap = normap * 2.0 - 1.0;
    vec3 up = normalize(vec3(0.001, 1, 0.001));
    vec3 surftan = normalize(cross(geomnor, up));
    vec3 surfbinor = cross(geomnor, surftan);
    return normap.y * surftan + normap.x * surfbinor + normap.z * geomnor;
}

void main() {
    vec3 norm = applyNormalMap(v_normal, vec3(texture(u_normap, v_uv)));
    vec3 col = vec3(texture(u_colmap, v_uv));

    // TODO: populate your g buffer
    fragData[0] = vec4(v_position, 1.0);
    fragData[1] = vec4(col, 1.0);
    fragData[2] = vec4(norm, 1.0);
    
    // save space using screen space normals
    // https://computergraphics.stackexchange.com/questions/3942/screenspace-normals-creation-normal-maps-and-unpacking -> z = sqrt(1-x2-y2);
    // gl_FragData[0] = vec4(v_position, norm.x);
    // gl_FragData[1] = vec4(col, norm.y);
}
