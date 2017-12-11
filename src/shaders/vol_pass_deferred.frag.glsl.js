export default function(params) {
  return `#version 300 es
  precision highp float;
  precision highp sampler3D;

  uniform sampler2D u_lightbuffer;
  
  uniform sampler2D u_gbuffers[${params.numGBuffers}];

  uniform sampler3D u_volBuffer;

  uniform mat4 u_viewProjectionMatrix;
  uniform mat4 u_lightViewProjectionMatrix;
  uniform sampler2D u_shadowMap;

  in vec2 v_uv;

  uniform vec3 u_lightCol;
  uniform float u_lightIntensity;

  uniform sampler2D u_clusterbuffer;
  uniform mat4 u_viewMatrix;
  uniform mat4 u_invViewMatrix;
  uniform float u_screenW;
  uniform float u_screenH;
  uniform float u_camN;
  uniform float u_camF;
  uniform vec3 u_camPos;

  uniform float u_time;
  uniform float u_volSize;
  uniform mat4 u_volTransMat;
  uniform mat4 u_invVolTransMat;
  uniform mat4 u_invTranspVolTransMat;

  uniform float u_density;
  uniform vec3 u_dirLightCol;

  out vec4 out_Color;
  #define PI 3.14159265

  #define NUM_STEPS 100

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

  float phaseFunction()
  {
      return 1.0/(4.0*PI);
  }

  vec2 intersectCube(vec3 p, vec3 dir)
  {
    float tNear = -1000.0;
    float tFar  = 1000.0;

    float min = -u_volSize / 2.0;
    float max = u_volSize / 2.0;

    for(int i = 0; i < 3; i++) {
      // X-Slab
      if(dir[i] == 0.0) {
        if(p[i] < min || p[i] > max) {
          // miss
          return vec2(2000.0, 2000.0);
        }
      }

      float t0 = (min - p[i]) / dir[i];
      float t1 = (max - p[i]) / dir[i];

      if(t0 > t1) {
        // swap
        float t = t0;
        t0 = t1;
        t1 = t;
      }

      if(t0 > tNear) {
        tNear = t0;
      }

      if(t1 < tFar) {
        tFar = t1;
      }
    }

    if(tNear > tFar) {
      // miss 
      return vec2(2000.0, 2000.0);
    }

    return vec2(tNear, tFar);
  }

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
    float visibility  = (shadowCoord.z > depth+0.005)? 0.0 : 1.0;  
    return visibility;
  }

  void main() 
  {
    const vec3 ambientLight = vec3(0.025);

    // Get position, color, and normal information from G-Buffer
    vec3 v_position = texture(u_gbuffers[0], v_uv).xyz;
    vec3 albedo     = texture(u_gbuffers[1], v_uv).xyz;
    vec3 normal     = texture(u_gbuffers[2], v_uv).xyz;

    vec3 fragColor = vec3(0.0);
    
    // Make a ray from the camera to the point in world space.
    vec3 rayOrigin    = u_camPos;
    vec3 rayDirection = (v_position - rayOrigin);
    float len = length(rayDirection);

    rayDirection = normalize(rayDirection);

    // Take the ray to the volumetric cube space
    vec3 rayOriginVol = (u_volTransMat * vec4(rayOrigin, 1.0)).xyz;
    vec3 rayDirectionVol = (u_volTransMat * vec4(v_position, 1.0)).xyz - rayOriginVol;

    vec2 tValues = intersectCube(rayOriginVol, rayDirectionVol);
    float tNear = tValues.x;
    float tFar = tValues.y;

    // float rayLength = length(rayDirectionVol);
    float rayLength = abs(tFar - tNear);
    rayDirectionVol = normalize(rayDirectionVol);

    float stepSize = len / float(NUM_STEPS);

    float muS = 0.009; // scattering
    float muA = 0.006; // attenuation
    float muE = muS + muA; // extinction

    float transmittance = 1.0;
    vec3 scatteredLight = vec3(0.0);

    vec4 pWorld;
    vec3 p;
    for(float i = 1.0; i <= len; i += stepSize) {
      // Get ray marched point
      p = rayOriginVol + (i * rayDirectionVol);
      pWorld = (u_invVolTransMat * vec4(p.xyz, 1.0));//rayOrigin + i * rayDirection;
      pWorld /= pWorld.w;

      // add fog value to muS..
      vec3 p1 = p.xyz;
      p1.x += u_time;
      float den = texture(u_volBuffer, p1 / 16.0).x;
      muS = i>tNear && i<tFar ? den * u_density: 0.02;
      muE = max(0.0000001, muA + muS);

      vec3 scat = vec3(0.0);// = muS * Li * phaseFunction();

      for (int j = 0; j < ${params.numLights}; j++) {
        Light light = UnpackLight(j);
        vec3 L = (u_volTransMat * vec4(light.position, 1.0)).xyz - p;
        vec3 Li = 10.0 * light.color / dot(L, L);
        scat += muS * Li * phaseFunction();
      }

      vec3 Li = u_dirLightCol;
      #define USESHADOW 
      #ifdef USESHADOW
        float shadow = shadowMap(p.xyz - u_volTransMat[3].xyz);
        //shadow = shadow==0.0 ? 0.1 : 
        scat += 5.0 * (shadow+0.01) * muS * Li * phaseFunction();
      #else
        scat += muS * Li * phaseFunction();     
      #endif

      float expE = exp(-muE * stepSize);
      vec3 integration = (scat - scat * expE) / muE;
      scatteredLight += transmittance * integration;
      transmittance *= expE;
    }

    out_Color = vec4(scatteredLight.xyz, transmittance);
  }
  `;
}
