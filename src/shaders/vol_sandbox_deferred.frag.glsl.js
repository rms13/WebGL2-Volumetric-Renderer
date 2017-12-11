export default function(params) {
  return `#version 300 es
  precision highp float;
  precision highp sampler3D;

  #define USEPASS 1

  uniform sampler2D u_lightbuffer;
  
  uniform sampler2D u_gbuffers[${params.numGBuffers}];

  uniform sampler2D u_volPassBuffer;
  uniform sampler2D u_shadowMap;

  uniform sampler3D u_volBuffer;
  
  in vec4 v_pos;
  in vec4 v_lightPosition;
  in vec2 v_uv;

  uniform sampler2D u_clusterbuffer;

  uniform mat4 u_viewMatrix;
  uniform mat4 u_invViewMatrix;
  uniform mat4 u_viewProjectionMatrix;
  uniform mat4 u_viewProjectionMatrixLight;
  uniform mat4 u_lightViewProjectionMatrix;
  
  uniform int u_debugVolume;
  uniform int u_debugShadow;
  uniform vec3 u_dirLightCol;
  
  uniform float u_upscaleFactor;

  uniform float u_screenW;
  uniform float u_screenH;
  uniform float u_camN;
  uniform float u_camF;
  uniform vec3 u_camPos;

  uniform float u_time;
  uniform float u_volSize;
  //uniform vec3 u_volPos;
  uniform mat4 u_volTransMat;
  uniform mat4 u_invVolTransMat;
  uniform mat4 u_invTranspVolTransMat;

  out vec4 out_Color;

  #define PI 3.14159265
  #define NUM_STEPS 100
  
  float shadowMap(vec3 pos)
  {
    vec4 position       = u_viewProjectionMatrix * vec4(pos, 1.0);
    vec4 lightPosition  = u_lightViewProjectionMatrix * vec4(pos, 1.0);
    // Remove some shadow acne
    lightPosition.z -= 0.007;

    // Get the light direction from the point to the light
    vec4 lightDir     = normalize(vec4(0.0,0.0,0.0,1.0) - lightPosition);
    vec3 shadowCoord  = (lightPosition.xyz / lightPosition.w) / 2.0 + 0.5;

    vec3 sunCol       = vec3(0.5, 0.5, 0.4);
    vec4 rgbaDepth    = texture(u_shadowMap, shadowCoord.xy);
    float depth       = rgbaDepth.r; // Retrieve the z-value from R
    float visibility  = (shadowCoord.z > depth + 0.005)? 0.1 : 1.0;
    return visibility;
  }

  vec3 debugShadowMap(vec3 pos, vec3 nor, vec3 col)
  {
    vec4 position       = u_viewProjectionMatrix * vec4(pos, 1.0);
    vec4 lightPosition  = u_lightViewProjectionMatrix * vec4(pos, 1.0);
    // Remove some shadow acne
    lightPosition.z -= 0.007;

    // Get the light direction from the point to the light
    vec4 lightDir     = normalize(vec4(0.0,0.0,0.0,1.0) - lightPosition);
    vec3 shadowCoord  = (lightPosition.xyz / lightPosition.w) / 2.0 + 0.5;

    vec3 sunCol       = vec3(0.5, 0.5, 0.4);
    vec4 rgbaDepth    = texture(u_shadowMap, shadowCoord.xy);
    float depth       = rgbaDepth.r; // Retrieve the z-value from R
    float visibility  = (shadowCoord.z > depth + 0.005)? 0.1 : 1.0;
    float dotprod     = dot(lightDir.xyz, nor);
    vec3 albedo       = col * u_dirLightCol * max(dotprod, 0.05);

    return albedo * visibility;
  }

  struct Light {
    vec3 position;
    float radius;
    vec3 color;
  };
  
  float ExtractFloat(sampler2D textureToSample, int textureWidth, int textureHeight, int index, int component) {
    float u = float(index + 1) / float(textureWidth + 1);
    int pixel = component / 4;
    float v = float(pixel + 1) / float(textureHeight + 1);
    vec4 texel = texture(textureToSample, vec2(u, v));
    int pixelComponent = component - pixel * 4;
    if (pixelComponent == 0) {
      return texel[0];
    } else if (pixelComponent == 1) {
      return texel[1];
    } else if (pixelComponent == 2) {
      return texel[2];
    } else if (pixelComponent == 3) {
      return texel[3];
    }
  }

  Light UnpackLight(int index) {
    Light light;
    float u = float(index + 1) / float(${params.numLights + 1});
    vec4 v1 = texture(u_lightbuffer, vec2(u, 0.0));
    vec4 v2 = texture(u_lightbuffer, vec2(u, 0.5));
    light.position = v1.xyz;
    light.radius = ExtractFloat(u_lightbuffer, ${params.numLights}, 2, index, 3);
    light.color = v2.rgb;
    return light;
  }

  // Cubic approximation of gaussian curve so we falloff to exactly 0 at the light radius
  float cubicGaussian(float h) {
    if (h < 1.0) {
      return 0.25 * pow(2.0 - h, 3.0) - pow(1.0 - h, 3.0);
    } else if (h < 2.0) {
      return 0.25 * pow(2.0 - h, 3.0);
    } else {
      return 0.0;
    }
  }

  void main() {
    // Get position, color, and normal information from G-Buffer
    vec3 v_position = texture(u_gbuffers[0], v_uv).xyz;
    vec3 albedo     = texture(u_gbuffers[1], v_uv).xyz;
    vec3 normal     = texture(u_gbuffers[2], v_uv).xyz;
    float shadow     = shadowMap(v_position);

    vec4 lightPosition = u_lightViewProjectionMatrix * vec4(v_position, 1.0);

    vec3 fragColor = vec3(0.0, 0.0, 0.0);

    // DIRECTIONAL LIGHT - SUN
    vec3 sunDir = normalize(vec3(1.0, 0.5, 1.0));
    vec3 sunCol = 0.1 * vec3(0.5, 0.5, 0.4);
    fragColor += albedo * u_dirLightCol * max(dot(sunDir, normal), 0.05);

  #define USESHADOW 
  #ifdef USESHADOW
    fragColor *= shadow;     
  #endif

#define VOLUME
#ifdef VOLUME
    vec4 volTexSample00 = texture(u_volPassBuffer, v_uv * u_upscaleFactor);
    fragColor *= volTexSample00.w;
    fragColor += volTexSample00.xyz;
#endif

    out_Color = vec4(fragColor.xyz, 1.0);

    // DEBUG VIEWS
    if(u_debugVolume == 1) {
      out_Color = vec4(volTexSample00.xyz, 1.0);
    }

    if(u_debugShadow == 1) {
      out_Color = vec4(debugShadowMap(v_position, normal, albedo), 1.0);
    }

    if(u_debugShadow == 1 && u_debugVolume == 1) {
      out_Color = vec4(debugShadowMap(v_position, normal, albedo), 1.0) + vec4(volTexSample00.xyz, 1.0);
    }
  }
  `;
}
