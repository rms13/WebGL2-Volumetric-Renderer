import { gl, canvas } from '../init';
import { mat4, vec4, vec3, quat} from 'gl-matrix';
import { loadShaderProgram, renderFullscreenQuad } from '../utils';
import { NUM_LIGHTS } from '../scene';
import { MAX_LIGHTS_PER_CLUSTER } from './clustered';
import toTextureVert from '../shaders/deferredToTexture.vert.glsl';
import toTextureFrag from '../shaders/deferredToTexture.frag.glsl';
import QuadVertSource from '../shaders/quad.vert.glsl';
import fsSource from '../shaders/vol_deferred.frag.glsl.js';
import fsSandboxSource from '../shaders/vol_sandbox_deferred.frag.glsl.js';
import shadowVert from '../shaders/shadow.vert.glsl';
import shadowFrag from '../shaders/shadow.frag.glsl.js';
import VolPassVertSource from '../shaders/vol_pass_deferred.vert.glsl';
import VolPassFragSource from '../shaders/vol_pass_deferred.frag.glsl.js';
import VolSandboxPassFragSource from '../shaders/vol_sandbox_pass_deferred.frag.glsl.js';
import TextureBuffer from './textureBuffer';
import ClusteredRenderer from './clustered';

export const NUM_GBUFFERS = 3;

export default class ClusteredDeferredRenderer extends ClusteredRenderer {
  constructor(xSlices, ySlices, zSlices) {
    super(xSlices, ySlices, zSlices);

    this.setupDrawBuffers(canvas.width, canvas.height);
    
    // Create a texture to store light data
    this._lightTexture = new TextureBuffer(NUM_LIGHTS, 8);

    // Create a 3D texture to store volume
    this._upscaleFactor = 32;
    this._heterogenous = true;
    this.createVolumeBuffer(vec3.fromValues(0,-4,0), this._upscaleFactor, this._heterogenous);
    // this.createVolumeBuffer(vec3.fromValues(0,15,0));

    this._progShadowMap = loadShaderProgram(shadowVert, shadowFrag({}), {
      uniforms: [ 'u_viewProjectionMatrix', 
                  'u_colmap', 
                  'u_normap', 
                  'u_viewMatrix'
                ],
      attribs:  [ 'a_position', 
                  'a_normal', 
                  'a_uv'
                ]
    });

    this._progCopy = loadShaderProgram(toTextureVert, toTextureFrag, {
      uniforms: ['u_viewProjectionMatrix', 'u_colmap', 'u_normap', 'u_viewMatrix'],
      attribs:  ['a_position', 'a_normal', 'a_uv']
    });

    this._progVolPass = loadShaderProgram(VolPassVertSource, VolPassFragSource({
      numLights: NUM_LIGHTS,
      maxLights: MAX_LIGHTS_PER_CLUSTER,
      numGBuffers: NUM_GBUFFERS,
      xSlices: xSlices, ySlices: ySlices, zSlices: zSlices,
    }), {
      uniforms: [ 'u_gbuffers[0]', 
                  'u_gbuffers[1]', 
                  'u_gbuffers[2]', 
                  'u_lightbuffer', 
                  'u_clusterbuffer', 
                  'u_viewMatrix', 
                  'u_invViewMatrix', 
                  'u_screenW', 
                  'u_screenH', 
                  'u_camN', 
                  'u_camF', 
                  'u_camPos',
                  'u_volBuffer', 
                  'u_time', 
                  'u_volSize', 
                  'u_volTransMat', 
                  'u_invVolTransMat', 
                  'u_invTranspVolTransMat',
                  'u_viewProjectionMatrix',
                  'u_lightViewProjectionMatrix',
                  'u_shadowMap',
                  /*'u_volPos', 'u_volOrient'*/
                ],
      attribs:  ['a_position']
    });

    this._progVolSandboxPass = loadShaderProgram(VolPassVertSource, VolSandboxPassFragSource({
      numLights: NUM_LIGHTS,
      maxLights: MAX_LIGHTS_PER_CLUSTER,
      numGBuffers: NUM_GBUFFERS,
      xSlices: xSlices, ySlices: ySlices, zSlices: zSlices,
    }), {
      uniforms: [ 'u_gbuffers[0]', 
                  'u_gbuffers[1]', 
                  'u_gbuffers[2]', 
                  'u_lightbuffer', 
                  'u_clusterbuffer', 
                  'u_viewMatrix', 
                  'u_invViewMatrix', 
                  'u_screenW', 
                  'u_screenH', 
                  'u_camN', 
                  'u_camF', 
                  'u_camPos',
                  'u_volBuffer', 
                  'u_time', 
                  'u_volSize', 
                  'u_volTransMat', 
                  'u_invVolTransMat', 
                  'u_invTranspVolTransMat',
                  'u_viewProjectionMatrix',
                  'u_lightViewProjectionMatrix',
                  'u_shadowMap',
                  'u_light1Col',
                  'u_light1Intensity',
                  'u_light1PosY',
                  'u_light1PosZ',
                  'u_light2Col',
                  'u_light2Intensity',
                  'u_light2PosX',
                  'u_light2PosZ'
                  /*'u_volPos', 'u_volOrient'*/
                ],
      attribs:  ['a_position']
    });

    this._progShade = loadShaderProgram(QuadVertSource, fsSource({
      numLights: NUM_LIGHTS,
      maxLights: MAX_LIGHTS_PER_CLUSTER,
      numGBuffers: NUM_GBUFFERS,
      xSlices: xSlices, ySlices: ySlices, zSlices: zSlices,
    }), {
      uniforms: [ 'u_gbuffers[0]', 
                  'u_gbuffers[1]', 
                  'u_gbuffers[2]', 
                  'u_lightbuffer', 
                  'u_clusterbuffer', 
                  'u_viewMatrix', 
                  'u_invViewMatrix', 
                  'u_screenW', 
                  'u_screenH', 
                  'u_camN', 
                  'u_camF', 
                  'u_camPos',
                  'u_time', 
                  'u_volBuffer', 
                  'u_volSize', 
                  'u_volTransMat', 
                  'u_invVolTransMat', 
                  'u_invTranspVolTransMat',
                  'u_volPassBuffer',
                  'u_shadowMap',
                  'u_lightViewProjectionMatrix',
                  'u_viewProjectionMatrix'
                ],
      attribs:  [ 'a_position'  ]
    });

    this._progSandboxShade = loadShaderProgram(QuadVertSource, fsSandboxSource({
      numLights: NUM_LIGHTS,
      maxLights: MAX_LIGHTS_PER_CLUSTER,
      numGBuffers: NUM_GBUFFERS,
      xSlices: xSlices, ySlices: ySlices, zSlices: zSlices,
    }), {
      uniforms: [ 'u_gbuffers[0]', 
                  'u_gbuffers[1]', 
                  'u_gbuffers[2]', 
                  'u_lightbuffer', 
                  'u_clusterbuffer', 
                  'u_viewMatrix', 
                  'u_invViewMatrix', 
                  'u_screenW', 
                  'u_screenH', 
                  'u_camN', 
                  'u_camF', 
                  'u_camPos',
                  'u_time', 
                  'u_volBuffer', 
                  'u_volSize', 
                  'u_volTransMat', 
                  'u_invVolTransMat', 
                  'u_invTranspVolTransMat',
                  'u_volPassBuffer',
                  'u_shadowMap',
                  'u_lightViewProjectionMatrix',
                  'u_viewProjectionMatrix'
                ],
      attribs:  [ 'a_position'  ]
    });

    this._projectionMatrix          = mat4.create();
    this._viewMatrix                = mat4.create();
    this._invViewMatrix             = mat4.create();
    this._viewProjectionMatrix      = mat4.create();
    this._invViewProjectionMatrix   = mat4.create();

    // View Projection for the Light
    this._lightViewProjectionMatrix   = mat4.create();
    this._lightProjectionMatrix       = mat4.create();
    this._lightViewMatrix             = mat4.create();
    mat4.ortho(this._lightProjectionMatrix, -20, 20, -20, 20, -20.0, 200);
    mat4.lookAt(this._lightViewMatrix, vec3.fromValues(.5,4,.5), vec3.fromValues(0,0,0), vec3.fromValues(0,1,0));
    mat4.multiply(this._lightViewProjectionMatrix, this._lightProjectionMatrix, this._lightViewMatrix);
    // mat4.perspective(this._lightViewProjectionMatrix, 70.0, 1, 1.0, 200.0);
    // mat4.lookAt(this._lightViewProjectionMatrix, dirLightPos, vec3.fromValues(0.0,0.0,0.0), vec3.fromValues(0.0,1.0,0.0));

    this.first = true;
  }

  setupDrawBuffers(width, height) {
    this._width = width;
    this._height = height;
    
    this._fboShadowMapPass = gl.createFramebuffer();
    var w = 1024;
    var h = 1024;
    //Create, bind, and store a depth target texture for the FBO
    this._shadowDepthTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._shadowDepthTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT16/*gl.DEPTH_COMPONENT*/, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fboShadowMapPass);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this._shadowDepthTex, 0);

    // Shadow Map
    this._shadowMapTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._shadowMapTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fboShadowMapPass);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._shadowMapTexture, 0);  
    
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) != gl.FRAMEBUFFER_COMPLETE) {
      throw "Framebuffer incomplete";
    }
 
    gl.drawBuffers([
      gl.COLOR_ATTACHMENT0
    ]);

    this._fbo = gl.createFramebuffer();    

    //Create, bind, and store a depth target texture for the FBO
    this._depthTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._depthTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT16/*gl.DEPTH_COMPONENT*/, width, height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this._depthTex, 0);

    // Create, bind, and store "color" target textures for the FBO
    this._gbuffers = new Array(NUM_GBUFFERS);
    //let attachments = new Array(NUM_GBUFFERS);

    this._gbuffers[0] = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[0]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._gbuffers[0], 0);

    this._gbuffers[1] = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[1]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this._gbuffers[1], 0);

    this._gbuffers[2] = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[2]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, this._gbuffers[2], 0);

    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) != gl.FRAMEBUFFER_COMPLETE) {
      throw "Framebuffer incomplete";
    }

    // Tell the WEBGL_draw_buffers extension which FBO attachments are
    // being used. (This extension allows for multiple render targets.)
    gl.drawBuffers([
      gl.COLOR_ATTACHMENT0,
      gl.COLOR_ATTACHMENT1,
      gl.COLOR_ATTACHMENT2
    ]);

    // Volume Pass..
    this._volPassTex = gl.createTexture();
    // var img = new Uint8Array(width * height);
    // for (var k = 0; k < width; ++k) {
    //   for (var j = 0; j < height; ++j) {
    //     this.data[i + j * this.SIZE + k * this.SIZE * this.SIZE] = 0;//Math.random() * 255.0;//(i + j * this.SIZE + k * this.SIZE * this.SIZE) / max * 255.0;//Math.random() * 255.0; // snoise([i, j, k]) * 256;
    //   }
    // }
    //this._volPassTex.generateMipmaps = false;
    // this._volPassTex.minFilter = THREE.LinearFilter;
    // this._volPassTex.magFilter = THREE.LinearFilter;
    //gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._volPassTex);
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.w = (width % 8);
    this.w += width;
    this.h = (height % 8);
    this.h += height;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.w, this.h, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    
    this._fboVolPass = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fboVolPass);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._volPassTex, 0);
    
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) != gl.FRAMEBUFFER_COMPLETE) {
      throw "Framebuffer incomplete";
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  createVolumeBuffer(pos, upscaleFactor, heterogenous) {
    // CREATE AND BING THE 3D-TEXTURE
    // reference: http://www.realtimerendering.com/blog/webgl-2-new-features/
    this.SIZE = upscaleFactor;
    var max = this.SIZE + this.SIZE*this.SIZE + this.SIZE*this.SIZE*this.SIZE;
    this.data = new Uint8Array(this.SIZE * this.SIZE * this.SIZE);
    for (var k = 0; k < this.SIZE; ++k) {
      for (var j = 0; j < this.SIZE; ++j) {
        for (var i = 0; i < this.SIZE; ++i) {
          let density = 255.0 * Math.random();
          // if(heterogenous) {
          //   density *= Math.random();
          // }

          this.data[i + j * this.SIZE + k * this.SIZE * this.SIZE] = density;//(i + j * this.SIZE + k * this.SIZE * this.SIZE) / max * 255.0;//Math.random() * 255.0; // snoise([i, j, k]) * 256;
        }
      }
    }

    // var volPos = vec3.fromValues(0, -4, 0); // position of the volume
    var volPos = pos; // position of the volume
    var volScale = vec3.fromValues(1,1,1); // scale of the volume
    var volOrient = quat.create(); // [0, 45 * Math.PI/180, 0];
    quat.fromEuler(volOrient, 0.0, 0.0, 0.0);

    this.volTransMat = mat4.create();
    mat4.fromRotationTranslationScale(this.volTransMat, volOrient, volPos, volScale);
    this.invVolTransMat = mat4.create();
    mat4.invert(this.invVolTransMat, this.volTransMat);    
    this.invTranspVolTransMat = mat4.create();
    mat4.transpose(this.invTranspVolTransMat, this.invVolTransMat);

    this._volBuffer = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this._volBuffer);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_BASE_LEVEL, 0);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAX_LEVEL, Math.log2(this.SIZE));
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage3D(
      gl.TEXTURE_3D,  // target
      0,              // level
      gl.R8,        // internalformat
      this.SIZE,           // width
      this.SIZE,           // height
      this.SIZE,           // depth
      0,              // border
      gl.RED,         // format
      gl.UNSIGNED_BYTE,       // type
      this.data            // pixel
    );
    gl.generateMipmap(gl.TEXTURE_3D);
    gl.bindTexture(gl.TEXTURE_3D, null);
    // gl.uniform1i(this._shaderProgram.u_volBuffer, 0);
    // END: CREATE 3D-TEXTURE
  }

  resize(width, height) {
    this._width = width;
    this._height = height;

    gl.bindTexture(gl.TEXTURE_2D, this._depthTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT16, width, height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
    
    for (let i = 0; i < NUM_GBUFFERS; i++) {
      gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[i]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    }
    
    // Shadow Map
    gl.bindTexture(gl.TEXTURE_2D, this._shadowDepthTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT16, 1024, 1024, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
    gl.bindTexture(gl.TEXTURE_2D, this._shadowMapTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1024, 1024, 0, gl.RGBA, gl.FLOAT, null);

    // volume pass..
    gl.bindTexture(gl.TEXTURE_2D, this._volPassTex);
    this.w = (width % 8);
    this.w += width;
    this.h = (height % 8);
    this.h += height;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this.w/2, this.h/2, 0, gl.RGBA, gl.FLOAT, null);

    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  render(camera, scene, sandboxMode, 
        light1Col, light1Intensity, light1PosY, light1PosZ,
        light2Col, light2Intensity, light2PosX, light2PosZ,
        volPosX, volPosY, volPosZ,
        volScaleX, volScaleY, volScaleZ,
        upscaleFactor, heterogenous, scattering, absorption) 
  {
    if (canvas.width != this._width || canvas.height != this._height) {
      this.resize(canvas.width, canvas.height);
    }

    // Update the camera matrices
    camera.updateMatrixWorld();
    mat4.invert(this._viewMatrix, camera.matrixWorld.elements);
    mat4.copy(this._projectionMatrix, camera.projectionMatrix.elements);
    mat4.multiply(this._viewProjectionMatrix, this._projectionMatrix, this._viewMatrix);
    mat4.invert(this._invViewMatrix, this._viewMatrix);
    mat4.invert(this._invViewProjectionMatrix, this._viewProjectionMatrix);

    //--------------------------------------------------  
    // Shadow
    //--------------------------------------------------  
    // Render to the whole screen
    gl.viewport(0, 0, 1024, 1024);
    // Bind the framebuffer
    // gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fboShadowMapPass);
    // Clear the frame
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // Use this shader program
    gl.useProgram(this._progShadowMap.glShaderProgram);
    // Bind any uniform variables
    gl.uniformMatrix4fv(this._progShadowMap.u_viewProjectionMatrix, false, this._lightViewProjectionMatrix);
    scene.draw(this._progShadowMap);
    // gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // renderFullscreenQuad(this._progShadowMap);



    //--------------------------------------------------  
    // Create texture to hold g-buffers
    //--------------------------------------------------              
    // Render to the whole screen
    gl.viewport(0, 0, canvas.width, canvas.height);
    // Bind the framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    // Clear the frame
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // Use the shader program to copy to the draw buffers
    gl.useProgram(this._progCopy.glShaderProgram);
    // Upload the camera matrix
    gl.uniformMatrix4fv(this._progCopy.u_viewProjectionMatrix, false, this._viewProjectionMatrix);
    // view matrix
    gl.uniformMatrix4fv(this._progCopy.u_viewMatrix, false, this._viewMatrix);
    // Draw the scene. This function takes the shader program so that the model's textures can be bound to the right inputs
    scene.draw(this._progCopy);
    // gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // renderFullscreenQuad(this._progShadowMap);

    

    for (let i = 0; i < NUM_LIGHTS; ++i) {
      this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 0) + 0] = scene.lights[i].position[0];
      this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 0) + 1] = scene.lights[i].position[1];
      this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 0) + 2] = scene.lights[i].position[2];
      this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 0) + 3] = scene.lights[i].radius;

      this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 1) + 0] = scene.lights[i].color[0];
      this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 1) + 1] = scene.lights[i].color[1];
      this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 1) + 2] = scene.lights[i].color[2];
    }
    // Update the light texture
    this._lightTexture.update();

    // Update the clusters for the frame
    //if(this.first === true) {
      this.updateClustersOptimized(camera, this._viewMatrix, scene);
    //  this.first = false;
    //}

    if(!sandboxMode) {
      //--------------------------------------------------  
      // Volume Pass
      //--------------------------------------------------              
      gl.viewport(0, 0, canvas.width/2, canvas.height/2);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._fboVolPass);
      // Clear the frame
      gl.clear(gl.COLOR_BUFFER_BIT);
      // Use this shader program
      gl.useProgram(this._progVolPass.glShaderProgram);

      // TODO: Bind any other shader inputs
      gl.uniformMatrix4fv(this._progVolPass.u_viewProjectionMatrix, false, this._viewProjectionMatrix);
      gl.uniformMatrix4fv(this._progVolPass.u_lightViewProjectionMatrix, false, this._lightViewProjectionMatrix);
      gl.uniformMatrix4fv(this._progVolPass.u_viewMatrix, false, this._viewMatrix);
      gl.uniformMatrix4fv(this._progVolPass.u_invViewMatrix, false, this._invViewMatrix);    
      gl.uniform1f(this._progVolPass.u_screenW, canvas.width);
      gl.uniform1f(this._progVolPass.u_screenH, canvas.height);
      gl.uniform1f(this._progVolPass.u_camN, camera.near);
      gl.uniform1f(this._progVolPass.u_camF, camera.far);
      gl.uniform3f(this._progVolPass.u_camPos, camera.position.x, camera.position.y, camera.position.z);
      
      gl.uniform1f(this._progVolPass.u_volSize, this.SIZE);
      // gl.uniform3f(this._progShade.u_volPos, this.volPos[0], this.volPos[1], this.volPos[2]);
      gl.uniformMatrix4fv(this._progVolPass.u_volTransMat, false, this.volTransMat);
      gl.uniformMatrix4fv(this._progVolPass.u_viewProjectionMatrix, false, this._viewProjectionMatrix);
      gl.uniformMatrix4fv(this._progVolPass.u_lightViewProjectionMatrix, false, this._lightViewProjectionMatrix);

      if(this.framenum === undefined) this.framenum = 0.0;
      this.framenum+=0.05;
      gl.uniform1f(this._progVolPass.u_time, this.framenum);

      // Bind g-buffers
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[0]);
      gl.uniform1i(this._progVolPass[`u_gbuffers[0]`], 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[1]);
      gl.uniform1i(this._progVolPass[`u_gbuffers[1]`], 1);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[2]);
      gl.uniform1i(this._progVolPass[`u_gbuffers[2]`], 2);

      // Bind the light and cluster textures...
      // Set the light texture as a uniform input to the shader
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this._lightTexture.glTexture);
      gl.uniform1i(this._progVolPass.u_lightbuffer, 3);

      // Set the cluster texture as a uniform input to the shader
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, this._clusterTexture.glTexture);
      gl.uniform1i(this._progVolPass.u_clusterbuffer, 4);

      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_3D, this._volBuffer);
      gl.uniform1i(this._progVolPass.u_volBuffer, 5);

      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_2D, this._shadowMapTexture);
      gl.uniform1i(this._progVolPass[`u_shadowMap`], 6);

      renderFullscreenQuad(this._progVolPass);
      //scene.draw(this._progVolPass);

      //--------------------------------------------------  
      // Final Shading Pass
      //--------------------------------------------------      
      gl.viewport(0, 0, canvas.width, canvas.height);
      // Bind the default null framebuffer which is the screen
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      // Clear the frame
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // Use this shader program
      gl.useProgram(this._progShade.glShaderProgram);

      // TODO: Bind any other shader inputs
      gl.uniformMatrix4fv(this._progShade.u_viewMatrix, false, this._viewMatrix);
      gl.uniformMatrix4fv(this._progShade.u_invViewMatrix, false, this._invViewMatrix);
      gl.uniform1f(this._progShade.u_screenW, canvas.width);
      gl.uniform1f(this._progShade.u_screenH, canvas.height);
      gl.uniform1f(this._progShade.u_camN, camera.near);
      gl.uniform1f(this._progShade.u_camF, camera.far);
      gl.uniform3f(this._progShade.u_camPos, camera.position.x, camera.position.y, camera.position.z);
      gl.uniformMatrix4fv(this._progShade.u_viewProjectionMatrix, false, this._viewProjectionMatrix);
      gl.uniformMatrix4fv(this._progShade.u_lightViewProjectionMatrix, false, this._lightViewProjectionMatrix);
      
      gl.uniform1f(this._progShade.u_volSize, this.SIZE);
      // gl.uniform3f(this._progShade.u_volPos, this.volPos[0], this.volPos[1], this.volPos[2]);
      gl.uniformMatrix4fv(this._progShade.u_volTransMat, false, this.volTransMat);
      gl.uniformMatrix4fv(this._progShade.u_invVolTransMat, false, this.invVolTransMat);
      gl.uniformMatrix4fv(this._progShade.u_invTranspVolTransMat, false, this.invTranspVolTransMat);

      // if(this.framenum === undefined) this.framenum = 0.0;
      // this.framenum+=0.05;
      gl.uniform1f(this._progShade.u_time, this.framenum);
      // if(this.t0 === undefined) {
      //   this.t0 = performance.now();
      //   gl.uniform1f(this._progShade.u_time, 0);
      // }
      // else {
      //   t1 = performance.now();
      //   gl.uniform1f(this._progShade.u_time, t1 - t0);
      // }
      // this.t0 = this.t1;

      // Bind g-buffers
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[0]);
      gl.uniform1i(this._progShade[`u_gbuffers[0]`], 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[1]);
      gl.uniform1i(this._progShade[`u_gbuffers[1]`], 1);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[2]);
      gl.uniform1i(this._progShade[`u_gbuffers[2]`], 2);

      // bind volume pass texture
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this._volPassTex);
      gl.uniform1i(this._progShade[`u_volPassBuffer`], 3);

      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, this._shadowMapTexture);
      gl.uniform1i(this._progShade[`u_shadowMap`], 4);

      // Bind the light and cluster textures...
      // Set the light texture as a uniform input to the shader
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, this._lightTexture.glTexture);
      gl.uniform1i(this._progShade.u_lightbuffer, 5);

      // Set the cluster texture as a uniform input to the shader
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_2D, this._clusterTexture.glTexture);
      gl.uniform1i(this._progShade.u_clusterbuffer, 6);

      // bind 3d volume texture
      gl.activeTexture(gl.TEXTURE7);
      gl.bindTexture(gl.TEXTURE_3D, this._volBuffer);
      gl.uniform1i(this._progShade.u_volBuffer, 7);

      renderFullscreenQuad(this._progShade);
    }
    else {
      // Update Volume Properties
      var volPos    = vec3.fromValues(volPosX, volPosY, volPosZ); // position of the volume
      var volScale  = vec3.fromValues(volScaleX, volScaleY, volScaleZ); // scale of the volume
      var volOrient = quat.create(); // [0, 45 * Math.PI/180, 0];
      quat.fromEuler(volOrient, 0.0, 0.0, 0.0);

      if(this._upscaleFactor == upscaleFactor) {
        mat4.fromRotationTranslationScale(this.volTransMat, volOrient, volPos, volScale);
        mat4.invert(this.invVolTransMat, this.volTransMat);    
        mat4.transpose(this.invTranspVolTransMat, this.invVolTransMat);
      }
      else {
        this.updateVolume(upscaleFactor, heterogenous, volPos, volScale, volOrient);
        this._upscaleFactor = upscaleFactor;  
        this._heterogenous = heterogenous;
      }


      //--------------------------------------------------  
      // Volume Pass
      //--------------------------------------------------              
      gl.viewport(0, 0, canvas.width/2, canvas.height/2);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._fboVolPass);
      // Clear the frame
      gl.clear(gl.COLOR_BUFFER_BIT);
      // Use this shader program
      gl.useProgram(this._progVolSandboxPass.glShaderProgram);

      // TODO: Bind any other shader inputs
      gl.uniformMatrix4fv(this._progVolSandboxPass.u_viewProjectionMatrix, false, this._viewProjectionMatrix);
      gl.uniformMatrix4fv(this._progVolSandboxPass.u_lightViewProjectionMatrix, false, this._lightViewProjectionMatrix);
      gl.uniformMatrix4fv(this._progVolSandboxPass.u_viewMatrix, false, this._viewMatrix);
      gl.uniformMatrix4fv(this._progVolSandboxPass.u_invViewMatrix, false, this._invViewMatrix);    
      gl.uniform1f(this._progVolSandboxPass.u_screenW, canvas.width);
      gl.uniform1f(this._progVolSandboxPass.u_screenH, canvas.height);
      gl.uniform1f(this._progVolSandboxPass.u_camN, camera.near);
      gl.uniform1f(this._progVolSandboxPass.u_camF, camera.far);
      gl.uniform3f(this._progVolSandboxPass.u_camPos, camera.position.x, camera.position.y, camera.position.z);
      
      gl.uniform3f(this._progVolSandboxPass.u_light1Col, light1Col[0], light1Col[1], light1Col[2]);
      gl.uniform1f(this._progVolSandboxPass.u_light1Intensity, light1Intensity);
      gl.uniform1f(this._progVolSandboxPass.u_light1PosY, light1PosY);
      gl.uniform1f(this._progVolSandboxPass.u_light1PosZ, light1PosZ);

      gl.uniform3f(this._progVolSandboxPass.u_light2Col, light2Col[0], light2Col[1], light2Col[2]);
      gl.uniform1f(this._progVolSandboxPass.u_light2Intensity, light2Intensity);
      gl.uniform1f(this._progVolSandboxPass.u_light2PosX, light2PosX);
      gl.uniform1f(this._progVolSandboxPass.u_light2PosZ, light2PosZ);
      
      gl.uniform1f(this._progVolSandboxPass.u_volSize, this.SIZE);
      // gl.uniform3f(this._progShade.u_volPos, this.volPos[0], this.volPos[1], this.volPos[2]);
      gl.uniformMatrix4fv(this._progVolSandboxPass.u_volTransMat, false, this.volTransMat);
      gl.uniformMatrix4fv(this._progVolSandboxPass.u_viewProjectionMatrix, false, this._viewProjectionMatrix);
      gl.uniformMatrix4fv(this._progVolSandboxPass.u_lightViewProjectionMatrix, false, this._lightViewProjectionMatrix);

      if(this.framenum === undefined) this.framenum = 0.0;
      this.framenum+=0.05;
      gl.uniform1f(this._progVolSandboxPass.u_time, this.framenum);

      // Bind g-buffers
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[0]);
      gl.uniform1i(this._progVolSandboxPass[`u_gbuffers[0]`], 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[1]);
      gl.uniform1i(this._progVolSandboxPass[`u_gbuffers[1]`], 1);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[2]);
      gl.uniform1i(this._progVolSandboxPass[`u_gbuffers[2]`], 2);

      // Bind the light and cluster textures...
      // Set the light texture as a uniform input to the shader
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this._lightTexture.glTexture);
      gl.uniform1i(this._progVolSandboxPass.u_lightbuffer, 3);

      // Set the cluster texture as a uniform input to the shader
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, this._clusterTexture.glTexture);
      gl.uniform1i(this._progVolSandboxPass.u_clusterbuffer, 4);

      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_3D, this._volBuffer);
      gl.uniform1i(this._progVolSandboxPass.u_volBuffer, 5);

      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_2D, this._shadowMapTexture);
      gl.uniform1i(this._progVolSandboxPass[`u_shadowMap`], 6);

      renderFullscreenQuad(this._progVolSandboxPass);
      //scene.draw(this._progVolPass);

      //--------------------------------------------------  
      // Final Shading Pass
      //--------------------------------------------------      
      gl.viewport(0, 0, canvas.width, canvas.height);
      // Bind the default null framebuffer which is the screen
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      // Clear the frame
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // Use this shader program
      gl.useProgram(this._progSandboxShade.glShaderProgram);

      // TODO: Bind any other shader inputs
      gl.uniformMatrix4fv(this._progSandboxShade.u_viewMatrix, false, this._viewMatrix);
      gl.uniformMatrix4fv(this._progSandboxShade.u_invViewMatrix, false, this._invViewMatrix);
      gl.uniform1f(this._progSandboxShade.u_screenW, canvas.width);
      gl.uniform1f(this._progSandboxShade.u_screenH, canvas.height);
      gl.uniform1f(this._progSandboxShade.u_camN, camera.near);
      gl.uniform1f(this._progSandboxShade.u_camF, camera.far);
      gl.uniform3f(this._progSandboxShade.u_camPos, camera.position.x, camera.position.y, camera.position.z);
      gl.uniformMatrix4fv(this._progSandboxShade.u_viewProjectionMatrix, false, this._viewProjectionMatrix);
      gl.uniformMatrix4fv(this._progSandboxShade.u_lightViewProjectionMatrix, false, this._lightViewProjectionMatrix);
      
      gl.uniform1f(this._progSandboxShade.u_volSize, this.SIZE);
      // gl.uniform3f(this._progShade.u_volPos, this.volPos[0], this.volPos[1], this.volPos[2]);
      gl.uniformMatrix4fv(this._progSandboxShade.u_volTransMat, false, this.volTransMat);
      gl.uniformMatrix4fv(this._progSandboxShade.u_invVolTransMat, false, this.invVolTransMat);
      gl.uniformMatrix4fv(this._progSandboxShade.u_invTranspVolTransMat, false, this.invTranspVolTransMat);

      // if(this.framenum === undefined) this.framenum = 0.0;
      // this.framenum+=0.05;
      gl.uniform1f(this._progSandboxShade.u_time, this.framenum);
      // if(this.t0 === undefined) {
      //   this.t0 = performance.now();
      //   gl.uniform1f(this._progShade.u_time, 0);
      // }
      // else {
      //   t1 = performance.now();
      //   gl.uniform1f(this._progShade.u_time, t1 - t0);
      // }
      // this.t0 = this.t1;

      // Bind g-buffers
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[0]);
      gl.uniform1i(this._progSandboxShade[`u_gbuffers[0]`], 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[1]);
      gl.uniform1i(this._progSandboxShade[`u_gbuffers[1]`], 1);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[2]);
      gl.uniform1i(this._progSandboxShade[`u_gbuffers[2]`], 2);

      // bind volume pass texture
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this._volPassTex);
      gl.uniform1i(this._progSandboxShade[`u_volPassBuffer`], 3);

      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, this._shadowMapTexture);
      gl.uniform1i(this._progSandboxShade[`u_shadowMap`], 4);

      // Bind the light and cluster textures...
      // Set the light texture as a uniform input to the shader
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, this._lightTexture.glTexture);
      gl.uniform1i(this._progSandboxShade.u_lightbuffer, 5);

      // Set the cluster texture as a uniform input to the shader
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_2D, this._clusterTexture.glTexture);
      gl.uniform1i(this._progSandboxShade.u_clusterbuffer, 6);

      // bind 3d volume texture
      gl.activeTexture(gl.TEXTURE7);
      gl.bindTexture(gl.TEXTURE_3D, this._volBuffer);
      gl.uniform1i(this._progSandboxShade.u_volBuffer, 7);

      renderFullscreenQuad(this._progSandboxShade); 
    }
  }

  updateVolume(upscaleFactor, heterogenous, pos, scale, orient)
  {
    gl.deleteTexture(this._volBuffer);
    // CREATE AND BING THE 3D-TEXTURE
    // reference: http://www.realtimerendering.com/blog/webgl-2-new-features/
    this.SIZE = upscaleFactor;
    var max = this.SIZE + this.SIZE*this.SIZE + this.SIZE*this.SIZE*this.SIZE;
    this.data = new Uint8Array(this.SIZE * this.SIZE * this.SIZE);
    for (var k = 0; k < this.SIZE; ++k) {
      for (var j = 0; j < this.SIZE; ++j) {
        for (var i = 0; i < this.SIZE; ++i) {
          let density = 255.0 * Math.random();
          // if(heterogenous) {
          //   density *= Math.random();
          // }

          this.data[i + j * this.SIZE + k * this.SIZE * this.SIZE] = density;
        }
      }
    }

    // var volPos = vec3.fromValues(0, -4, 0); // position of the volume
    var volPos = pos; // position of the volume
    var volScale = vec3.fromValues(1,1,1); // scale of the volume
    var volOrient = quat.create(); // [0, 45 * Math.PI/180, 0];
    quat.fromEuler(volOrient, 0.0, 0.0, 0.0);

    this.volTransMat = mat4.create();
    mat4.fromRotationTranslationScale(this.volTransMat, volOrient, volPos, volScale);
    this.invVolTransMat = mat4.create();
    mat4.invert(this.invVolTransMat, this.volTransMat);    
    this.invTranspVolTransMat = mat4.create();
    mat4.transpose(this.invTranspVolTransMat, this.invVolTransMat);

    this._volBuffer = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this._volBuffer);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_BASE_LEVEL, 0);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAX_LEVEL, Math.log2(this.SIZE));
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage3D(
      gl.TEXTURE_3D,  // target
      0,              // level
      gl.R8,        // internalformat
      this.SIZE,           // width
      this.SIZE,           // height
      this.SIZE,           // depth
      0,              // border
      gl.RED,         // format
      gl.UNSIGNED_BYTE,       // type
      this.data            // pixel
    );
    gl.generateMipmap(gl.TEXTURE_3D);
    gl.bindTexture(gl.TEXTURE_3D, null);
    // gl.uniform1i(this._shaderProgram.u_volBuffer, 0);
    // END: CREATE 3D-TEXTURE
  }
};
