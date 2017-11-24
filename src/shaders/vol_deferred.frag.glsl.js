export default function(params) {
  return `#version 300 es
  precision highp float;
  precision highp sampler3D;

  uniform sampler2D u_lightbuffer;
  
  uniform sampler2D u_gbuffers[${params.numGBuffers}];

  uniform sampler3D u_volBuffer;
  
  in vec2 v_uv;

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

  #define NUM_STEPS 200

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

  float transmittance(vec3 p1, vec3 p2)
  {
    
    float exponent = -EXTINCTION * texture(u_volBuffer, p2.xxx/u_volSize/4.0).x/255.0/*DENSITY*/ * distance(p1, p2);

    return exp(exponent);
  }

  float phaseFunction(vec3 wo, vec3 wi, float g)
  {
    float dot = dot(wo, wi);
    float cosTheta = cos(dot);

    float num = 1.0f - (g * g);
    float denom = 4.0f * PI * pow(1.0 + g * g - 2.0 * g * cosTheta, 1.5);

    return num / denom;
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

  void main() {
    const vec3 ambientLight = vec3(0.025);

    // Get position, color, and normal information from G-Buffer
    vec3 v_position = texture(u_gbuffers[0], v_uv).xyz;
    vec3 albedo = texture(u_gbuffers[1], v_uv).xyz;
    vec3 normal = texture(u_gbuffers[2], v_uv).xyz;

    //albedo = vec3(0.98,0.98,0.98);

    vec3 fragColor = vec3(0.0);

    // DIRECTIONAL LIGHT - SUN
    // vec3 sunDir = normalize(vec3(-1.0, 1.0, -1.0));
    // vec3 sunCol = vec3(0.5, 0.5, 0.4);
    // fragColor += albedo * sunCol * max(dot(sunDir, normal), 0.05);

    //point light
    vec3 lightPos = vec3(0.0, 2.0 * 1.0 * sin(u_time * 0.5) + 8.0, 0.0);
    vec3 lightCol = 100.0 * vec3(0.9, 0.8, 0.4);

    //-- Naive Volumetric Ray March
    // Make a ray from the camera to the point in world space.
    vec3 rayOrigin    = u_camPos;
    vec3 rayDirection = (v_position - rayOrigin);
    float len = length(rayDirection);

    rayDirection = normalize(rayDirection);

    // Take the ray to the volumetric cube space
    vec3 rayOriginVol = (u_volTransMat * vec4(rayOrigin, 1.0)).xyz;
    vec3 rayDirectionVol = (u_volTransMat * vec4(rayDirection, 0.0)).xyz;

    vec2 tValues = intersectCube(rayOriginVol, rayDirectionVol);
    float tNear = tValues.x;
    float tFar = tValues.y;

    // float rayLength = length(rayDirectionVol);
    float rayLength = abs(tFar - tNear);
    rayDirectionVol = normalize(rayDirectionVol);

    float stepSize = len / float(NUM_STEPS);

    float pmAlbedo = SCATTERING / EXTINCTION;

    vec3 fog = vec3(0.0);
    
    float muS = 0.0; // scattering
    float muE = 0.0; // extinction
    float muA = 0.05; // attenuation
    vec3 p = vec3(0.0, 0.0, 0.0);

    float transmittance = 1.0;
    vec3 scatteredLight = vec3(0.0);

    for(float i = 1.0; i <= len; i += stepSize) {
      // Get ray marched point
      vec3 p = rayOriginVol + (i * rayDirectionVol);

      // add fog value to muS..
      muS = i>tNear && i<tFar ? 1.5 : 0.03;
      muE = max(0.0000001, muA + muS);

      // evaluate lighting..
      vec3 L = (u_volTransMat * vec4(lightPos, 1.0)).xyz - p;
      // float distL = length(L);
      // vec3 lightDir = L / (distL);
      vec3 Li = lightCol / dot(L, L);

      // improved scattering
      vec3 scat = muS * Li * phaseFunction();
      float expE = exp(-muE * stepSize);
      vec3 integration = (scat - scat * expE) / muE;
      scatteredLight += transmittance * integration;
      transmittance *= expE;

      // normal scattering
      // transmittance *= exp(-muE * stepSize);
      // scatteredLight += muS * Li * phaseFunction() * transmittance;// * stepSize;
    }

    vec3 L = (u_volTransMat * vec4((lightPos - v_position), 1.0)).xyz;
    float distL = length(L);
    vec3 lightDir = L / (distL);
    vec3 normalVol = (u_volTransMat * vec4(normal, 0.0)).xyz;
    vec3 Li = max(0.0, dot(normalVol, lightDir)) * lightCol / (distL * distL);

    fragColor = (albedo/3.14) * Li;
    fragColor *= transmittance;
    fragColor += scatteredLight;

    // gamma correct
    fragColor = pow(fragColor, vec3(1.0/2.2));

    out_Color = vec4(fragColor, 1.0);
  }
  `;
}
