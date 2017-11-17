import { gl } from '../init';

export default class TextureBuffer {
  /**
   * This class represents a buffer in a shader. Unforunately we can't bind arbitrary buffers so we need to pack the data as a texture
   * @param {Number} elementCount The number of items in the buffer
   * @param {Number} elementSize The number of values in each item of the buffer
   */
  constructor(elementCount, elementSize) {
    // Initialize the texture. We use gl.NEAREST for texture filtering because we don't want to blend between values in the buffer. We want the exact value
    this._glTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._glTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // The texture stores 4 values in each "pixel". Thus, the texture we create is elementCount x ceil(elementSize / 4)
    this._pixelsPerElement = Math.ceil(elementSize / 4);
    this._elementCount = elementCount;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this._elementCount, this._pixelsPerElement, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Create a buffer to use to upload to the texture
    this._buffer = new Float32Array(elementCount * 4 * this._pixelsPerElement);
  }

  get glTexture() {
    return this._glTexture;
  }

  get buffer() {
    return this._buffer;
  }

  /**
   * Computes the starting buffer index to a particular item.
   * @param {*} index The index of the item
   * @param {*} component The ith float of an element is located in the (i/4)th pixel
   */
  bufferIndex(index, component) {
    return 4 * index + 4 * component * this._elementCount;
  }

  /**
   * Update the texture with the data in the buffer
   */
  update() {
    gl.bindTexture(gl.TEXTURE_2D, this._glTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this._elementCount, this._pixelsPerElement, gl.RGBA, gl.FLOAT, this._buffer);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
};
