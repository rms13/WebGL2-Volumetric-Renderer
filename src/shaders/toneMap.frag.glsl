#version 300 es
precision highp float;

uniform sampler2D u_HDRTexture;
uniform int u_toneMapType;
uniform float u_exposure;

in vec2 v_uv;

out vec4 LDROut;

// float exposure = 1.0;

void linear(inout vec3 color)
{
	color *= u_exposure;
	color = pow(color, vec3(1.0/2.2));
}

void reinhard(inout vec3 color)
{
	color *= u_exposure;
	color = color/(1.0+color);
	color = pow(color, vec3(1.0/2.2));
}

void uncharted2ToneMapping(inout vec3 color)
{
	float A = 0.15;
	float B = 0.50;
	float C = 0.10;
	float D = 0.20;
	float E = 0.02;
	float F = 0.30;
	float W = 11.2;
	color *= u_exposure;
	color = ((color * (A * color + C * B) + D * E) / (color * (A * color + B) + D * F)) - E / F;
	float white = ((W * (A * W + C * B) + D * E) / (W * (A * W + B) + D * F)) - E / F;
	color /= white;
	color = pow(color, vec3(1.0/2.2));
}

void main()
{
    vec3 texColor = vec3(texture(u_HDRTexture, v_uv));
	switch(u_toneMapType) {
		case 0:
			uncharted2ToneMapping(texColor);
			break;
		case 1:
			reinhard(texColor);
			break;
		case 2:
			linear(texColor);
			break;
		default:
			break;
	}
    LDROut = vec4(texColor,1.0);
}
