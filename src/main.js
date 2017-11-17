import { makeRenderLoop, camera, cameraControls, gui, gl } from './init';
import ForwardRenderer from './renderers/forward';
import ClusteredForwardPlusRenderer from './renderers/clusteredForwardPlus';
import ClusteredDeferredRenderer from './renderers/clusteredDeferred';
import Scene from './scene';

const FORWARD = 'Forward';
const CLUSTERED_FORWARD_PLUS = 'Clustered Forward+';
const CLUSTERED_DEFFERED = 'Clustered Deferred';

const params = {
  renderer: FORWARD,
  _renderer: null,
};

setRenderer(params.renderer);

function setRenderer(renderer) {
  switch(renderer) {
    case FORWARD:
      params._renderer = new ForwardRenderer();
      break;
    case CLUSTERED_FORWARD_PLUS:
      params._renderer = new ClusteredForwardPlusRenderer(15, 15, 15);
      break;
    case CLUSTERED_DEFFERED:
      params._renderer = new ClusteredDeferredRenderer(15, 15, 15);
      break;
  }
}

gui.add(params, 'renderer', [FORWARD, CLUSTERED_FORWARD_PLUS, CLUSTERED_DEFFERED]).onChange(setRenderer);

const scene = new Scene();
scene.loadGLTF('models/sponza/sponza.gltf');

camera.position.set(-10, 8, 0);
cameraControls.target.set(0, 2, 0);
gl.enable(gl.DEPTH_TEST);

function render() {
  scene.update();
  params._renderer.render(camera, scene);
}

makeRenderLoop(render)();