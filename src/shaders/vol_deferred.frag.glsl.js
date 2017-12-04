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

  #define ABSORBTION 0.006
  #define SCATTERING 0.009
  #define EXTINCTION ABSORBTION + SCATTERING
  #define DENSITY 0.5
  #define PI 3.14159265

  #define NUM_STEPS 100

  // To simplify: wavelength independent scattering and extinction
  // void getParticipatingMedia(out float muS, out float muE, in vec3 pos)
  // {
  //     float heightFog = 7.0 + 3.0 * clamp(displacementSimple(pos.xz*0.005 + iTime*0.01),0.0,1.0);
  //     heightFog = 0.3*clamp((heightFog-pos.y)*1.0, 0.0, 1.0);
      
  //     const float fogFactor = 1.0 + D_STRONG_FOG * 5.0;
      
  //     const float sphereRadius = 5.0;
  //     float sphereFog = clamp((sphereRadius-length(pos-vec3(20.0,19.0,-17.0)))/sphereRadius, 0.0,1.0);
      
  //     const float constantFog = 0.02;
  
  //     muS = constantFog + heightFog*fogFactor + sphereFog;
     
  //     const float muA = 0.0;
  //     muE = max(0.000000001, muA + muS); // to avoid division by zero extinction
  // }
  
  float volumetricShadow(in vec3 from, in vec3 to)
  {
    const float numStep = 16.0; // quality control. Bump to avoid shadow alisaing
    float shadow = 1.0;
    float muS = 0.0;
    float muE = 0.0;
    float muA = 0.05;
    float dd = length(to-from) / numStep;
    for(float s=0.5; s<(numStep-0.1); s+=1.0)// start at 0.5 to sample at center of integral part
    {
        vec3 pos = from + (to - from) * (s / (numStep));
        // getParticipatingMedia(muS, muE, pos);
        
        // muS = s > tNear && s < tFar ? 0.5 : 0.02;
        // muE = max(0.0000001, muA + muS);

        shadow *= exp(-muE * dd);
    }

    return shadow;
  }

  float shadowMap(vec3 pos, vec3 nor, vec3 col)
  {
    vec4 position       = u_viewProjectionMatrix * vec4(pos, 1.0);
    vec4 lightPosition  = u_lightViewProjectionMatrix * vec4(pos, 1.0);
    // Remove some shadow acne
    lightPosition.z -= 0.007;

    // Get the light direction from the point to the light
    vec4 lightDir     = normalize(vec4(0.0,0.0,0.0,1.0) - lightPosition);
    // vec4 lightDir     = normalize(position - lightPosition);
    vec3 shadowCoord  = (lightPosition.xyz / lightPosition.w) / 2.0 + 0.5;

    vec3 sunCol       = vec3(0.5, 0.5, 0.4);
    vec4 rgbaDepth    = texture(u_shadowMap, shadowCoord.xy);
    float depth       = rgbaDepth.r; // Retrieve the z-value from R
    float visibility  = (shadowCoord.z > depth + 0.005)? 0.1 : 1.0;
    // out_Color = vec4(shadowCoord, 1.0);
    float dotprod     = dot(lightDir.xyz, nor);
    vec3 albedo       = col * sunCol * max(dotprod, 0.05);
    // out_Color      = vec4(albedo * visibility, 1.0);    

    // return albedo * visibility;
    return visibility;
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
    vec3 volCol     = texture(u_volPassBuffer, v_uv).xyz;
    float shadow     = shadowMap(v_position, normal, albedo);
    
    vec4 lightPosition  = u_lightViewProjectionMatrix * vec4(v_position, 1.0);
    // Remove some shadow acne
    lightPosition.z -= 0.007;
    vec3 shadowCoord  = (lightPosition.xyz / lightPosition.w) / 2.0 + 0.5;

    const vec3 ambientLight = vec3(0.025);
    vec3 fragColor = vec3(0.0, 0.0, 0.0);

    vec4 sunDir     = normalize(vec4(0.0,0.0,0.0,1.0) - lightPosition);
    vec3 sunCol = vec3(0.5, 0.5, 0.4);
    fragColor += albedo * sunCol * max(dot(sunDir.xyz, normal), 0.05);
#define USESHADOW 
#ifdef USESHADOW
  fragColor *= shadow;//* volumetricShadow(v_position, lightPosition);      
#endif
      
    // Point light
    vec3 lightPos = vec3(0.0, 2.0 * 1.0 * sin(u_time * 0.5) + 8.0, 0.0);
    // vec3 lightPos = vec3(0.0, 8.0, 0.0);
    vec3 lightCol = vec3(0.9, 0.8, 0.4);

    vec3 L = (u_volTransMat * vec4((lightPos - v_position), 1.0)).xyz;
    float distL = length(L);
    vec3 lightDir = L / (distL);
    vec3 normalVol = (u_volTransMat * vec4(normal, 0.0)).xyz;
    vec3 Li = max(0.0, dot(normalVol, lightDir)) * lightCol / (distL * distL);

    fragColor += (albedo / PI) * Li;

    // int div = 4;
    // int step = div;
    // vec2 intCoord = ivec2(floor(v_uv.x * 0.25 * u_screenW), floor(v_uv.y * 0.25 * u_screenH));
    // vec2 actualCoord = ivec2(floor(v_uv.x * u_screenW), floor(v_uv.y * u_screenH));
    // float minCoordX = intCoord.x % 4.0;
    // float minCoordY = intCoord.y % 4.0;
    // float maxCoordX = 4 - minCoordX;
    // float maxCoordY = 4 - minCoordY;
    // vec2 coord = texture(u_volPassBuffer, v_uv * 0.25);

    // float right = left + step;
    // float left = v_uv.x * u_screenW;
    // float left = v_uv.x * u_screenW;
    float divW = 1.0/(u_screenW*0.25);
    float divH = 1.0/(u_screenH*0.25);
    vec4 volTexSample00 = texture(u_volPassBuffer, v_uv*0.25);
    // vec4 volTexSample01 = texture(u_volPassBuffer, vec2(v_uv.x, v_uv.y + divH));
    // vec4 volTexSample10 = texture(u_volPassBuffer, vec2(v_uv.x + divW, v_uv.y));
    // vec4 volTexSample11 = texture(u_volPassBuffer, vec2(v_uv.x + divW, v_uv.y + divH));
    // vec4 volTexSample = (volTexSample00 + volTexSample00 + volTexSample00 + volTexSample00) * 0.25;
    
#define VOLUME
#ifdef VOLUME
    fragColor *= volTexSample00.w;
    fragColor += volTexSample00.xyz;
#endif

    // Gamma Correction
// #define AMBIENT
#ifndef AMBIENT
    fragColor = pow(fragColor * ambientLight, vec3(1.0/ 2.2));
#else
    fragColor = pow(fragColor, vec3(1.0 / 2.2));
#endif

    out_Color = vec4(fragColor, 1.0);
  }
  `;
}
