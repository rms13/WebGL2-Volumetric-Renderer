import { makeRenderLoop, camera, cameraControls, gui, sandboxGUI, gl } from './init';
import ForwardRenderer from './renderers/forward';
import ClusteredForwardPlusRenderer from './renderers/clusteredForwardPlus';
import ClusteredDeferredRenderer from './renderers/clusteredDeferred';
import Scene from './scene';

const FORWARD = 'Forward';
const CLUSTERED_FORWARD_PLUS = 'Clustered Forward+';
const CLUSTERED_DEFFERED = 'Clustered Deferred';

const params = {
  renderer: CLUSTERED_DEFFERED,
  _renderer: null,
  SandboxMode: false,
  Light1Color: [ 0, 128, 255 ],
  Light1Intensity: 1,
  Light1PosY: 0.0,
  Light1PosZ: 0.0,

  Light2Color: [ 1, 0, 0 ],
  Light2Intensity: 1,
  Light2PosX: 0.0,
  Light2PosZ: 0.0,
};

setRenderer(params.renderer);

function setRenderer(renderer) {
  switch(renderer) {
    case FORWARD:
      params._renderer = new ForwardRenderer();
      break;
    case CLUSTERED_FORWARD_PLUS:
      params._renderer = new ClusteredDeferredRenderer(15, 15, 15);
      break;
    case CLUSTERED_DEFFERED:
      params._renderer = new ClusteredDeferredRenderer(15, 15, 15);
      break;
  }

  if(params.SandboxMode) {
    light1Folder.open();
  }
}

gui.add(params, 'renderer', [FORWARD, CLUSTERED_FORWARD_PLUS, CLUSTERED_DEFFERED]).onChange(setRenderer);

var sandboxFolder = gui.addFolder('Sandbox Mode');
sandboxFolder.add(params, 'SandboxMode').onChange(setRenderer);

var light1Folder = sandboxFolder.addFolder('Light 1');
light1Folder.add(params, 'Light1PosY', 0.0, 10.0).onChange(setRenderer);
light1Folder.add(params, 'Light1PosZ', -5.0, 5.0).onChange(setRenderer);
light1Folder.addColor(params, 'Light1Color').onChange(setRenderer);
light1Folder.add(params, 'Light1Intensity', 1, 30).onChange(setRenderer);
light1Folder.close();

var light2Folder = sandboxFolder.addFolder('Light 2');
light2Folder.add(params, 'Light2PosX', -10, 10.0).onChange(setRenderer);
light2Folder.add(params, 'Light2PosZ', -5.0, 5.0).onChange(setRenderer);
light2Folder.addColor(params, 'Light2Color').onChange(setRenderer);
light2Folder.add(params, 'Light2Intensity', 1, 30).onChange(setRenderer);
light2Folder.close();

const scene = new Scene();
scene.loadGLTF('models/sponza/sponza.gltf');
// scene.loadGLTF('models/box/box.gltf');

camera.position.set(-10, 8, 0);
cameraControls.target.set(0, 2, 0);
gl.enable(gl.DEPTH_TEST);

function render() {
  scene.update();
  params._renderer.render(camera, scene, params.SandboxMode, 
    params.Light1Color, params.Light1Intensity, params.Light1PosY, params.Light1PosZ, 
    params.Light2Color, params.Light2Intensity, params.Light2PosX, params.Light2PosZ);
}

makeRenderLoop(render)();