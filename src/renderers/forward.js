import { gl } from '../init';
import { mat4, vec3, vec4 } from 'gl-matrix';
import { loadShaderProgram } from '../utils';
import { NUM_LIGHTS } from '../scene';
import shadowVert from '../shaders/shadow.vert.glsl';
import shadowFrag from '../shaders/shadow.frag.glsl.js';
import vsSource from '../shaders/forward.vert.glsl';
import fsSource from '../shaders/forward.frag.glsl.js';
import TextureBuffer from './textureBuffer';

export default class ForwardRenderer {
  constructor() {
    // Create a texture to store light data
    this._lightTexture = new TextureBuffer(NUM_LIGHTS, 8);

    //-- Initialize shader for shadow mapping
    this._shadowMapProgram = loadShaderProgram(shadowVert, shadowFrag({
    }), 
    {
      uniforms: [ 'u_viewProjectionMatrix' ],
      attribs:  [ 'a_position' ]
    });

    //-- Initialize shader for regular drawing
    // Initialize a shader program. The fragment shader source is compiled based on the number of lights
    this._shaderProgram = loadShaderProgram(vsSource, fsSource({
      numLights: NUM_LIGHTS
    }), {
      uniforms: [ 'u_viewProjectionMatrix', 
                  'u_colmap', 
                  'u_normap', 
                  'u_lightbuffer'
                ],
      attribs:  [ 'a_position', 
                  'a_normal', 
                  'a_uv'
                ]
    });

    // Matrices to render from the camera's POV
    this._projectionMatrix      = mat4.create();
    this._viewMatrix            = mat4.create();
    this._viewProjectionMatrix  = mat4.create();

    // Matrix to render from the light's POV
    this._viewProjectionMatrixLight  = mat4.create();

    // Create the frame buffer
    this._fbo = gl.createFramebuffer();

    // Create the texture 
    this._shadowTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._shadowTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // Create a render buffer 
    this._depthBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this._depthBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, canvas.width, canvas.height);

    // Attach the texture and the renderbuffer object to the FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._shadowTexture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this._depthBuffer);

    var e = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (gl.FRAMEBUFFER_COMPLETE !== e) {
        console.log('Frame buffer object is incomplete: ' + e.toString());
        return error();
    }

    this._fbo.texture = this._shadowTexture;

    // Unbind the buffer object
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);

    // Set a texture object to the texture unit
    gl.activeTexture(gl.TEXTURE0); 
    gl.bindTexture(gl.TEXTURE_2D, this._fbo.texture);

    // Set the clear color and enable the depth test
    gl.clearColor(0, 0, 0, 1);
    gl.enable(gl.DEPTH_TEST);
  }

  render(camera, scene) {
    // Update the camera matrices
    camera.updateMatrixWorld();
    mat4.invert(this._viewMatrix, camera.matrixWorld.elements);
    mat4.copy(this._projectionMatrix, camera.projectionMatrix.elements);
    mat4.multiply(this._viewProjectionMatrix, this._projectionMatrix, this._viewMatrix);

    // Update the light matrices
    var lightPos = vec3.create();
    lightPos[0] = 0;
    lightPos[1] = 5;
    lightPos[2] = 0;
    var look = vec3.create();
    look[0] = 0;
    look[1] = 0;
    look[2] = 0;
    var up = vec3.create();
    up[0] = 0;
    up[1] = 1;
    up[2] = 0;
    mat4.perspective(this._viewProjectionMatrixLight, 70.0, canvas.width / canvas.height, 1.0, 200.0);
    mat4.lookAt(this._viewProjectionMatrixLight,
                lightPos,
                look,
                up);

    // Update the buffer used to populate the texture packed with light data
    // for (let i = 0; i < NUM_LIGHTS; ++i) {
    //   this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 0) + 0] = scene.lights[i].position[0];
    //   this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 0) + 1] = scene.lights[i].position[1];
    //   this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 0) + 2] = scene.lights[i].position[2];
    //   this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 0) + 3] = scene.lights[i].radius;

    //   this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 1) + 0] = scene.lights[i].color[0];
    //   this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 1) + 1] = scene.lights[i].color[1];
    //   this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 1) + 2] = scene.lights[i].color[2];
    // }
    // // Update the light texture
    // this._lightTexture.update();

    //-- Create the shadow map



    //-- Draw the scene normally
    // Bind the default null framebuffer which is the screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // Render to the whole screen
    gl.viewport(0, 0, canvas.width, canvas.height);
    // Clear the frame
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // Use this shader program
    gl.useProgram(this._shaderProgram.glShaderProgram);
    // Upload the camera matrix
    gl.uniformMatrix4fv(this._shaderProgram.u_viewProjectionMatrix, false, this._viewProjectionMatrix);

    // Set the light texture as a uniform input to the shader
    // gl.activeTexture(gl.TEXTURE0);
    // gl.bindTexture(gl.TEXTURE_2D, this._lightTexture.glTexture);
    // gl.uniform1i(this._shaderProgram.u_lightbuffer, 0);

    // Draw the scene. This function takes the shader program so that the model's textures can be bound to the right inputs
    scene.draw(this._shaderProgram);
  }
};
