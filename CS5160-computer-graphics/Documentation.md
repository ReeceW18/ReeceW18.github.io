# Overview
This is the documentation for my [CS5160 Computer Graphics](/CS5160-computer-graphics/) Project 1. The assignment instructed creating an interactive experience rendered via pinhole projection, with separate modes for using js canvas strokes, simulated rasteration with lines, and simulated rasteration with triangle faces. It is available to interact with at [CS5160_Project1.html](CS5160_Project1.html). [Source code](https://github.com/ReeceW18/ReeceW18.github.io/tree/main/CS5160-computer-graphics/CS5160_Project1.html).

<video controls preload="metadata" playsinline poster="/CS5160-computer-graphics/assets/demo_thumbnail.png" width="100%" style="max-width: 800px; height: auto; background-color: #000;">
  <source src="/CS5160-computer-graphics/assets/demo.mp4" type="video/mp4">
</video>

### NOTES ON TERMINOLOGY
When I use UV in this documentation and in variable names it generally refers to 2D x,y coordinates, when talking about pinhole projection in class we used UV to distinguish between the projected 2d xy and 3d space xyz.

Things described and written as though they are variable/function names may or may not be the true name within the code.

## Design
I was inspired by vaporwave style wallpapers (ex: <https://www.youtube.com/watch?v=41vuqCTd2-U>). Below is my design drawing and brainstorming process. 

Notably, the score was never implemented, later decided that it was out of scope for this project.

<img src="/CS5160-computer-graphics/assets/CS5160_Project1_Design_Page1.jpg" style="max-height: 100%; height: auto; max-width: min(400px, 100%);">
<img src="/CS5160-computer-graphics/assets/CS5160_Project1_Design_Page2.jpg" style="vertical-align: top; max-height: 100%; height: auto; max-width: min(400px, 100%);">

## Features
### Modes
<img src="/CS5160-computer-graphics/assets/modes.png" style="vertical-align: top; max-height: 100%; height: auto; max-width: min(400px, 100%);">
    
All modes use simple pinhole projection, that is object space offset to world space offset to camera space then projected to screen space using simple pinhole projection, u = x / z, v = y / z. Depending on mode scales to the js canvas width and height or a simulated 320x200 screen.


Three modes, wireframe (js canvas strokes), raster edges, and raster faces.

Brief overview of core pipeline structure:

- Draw() blanks the screen, calls the high-level draw functions for each object category. In wireframe mode the draw functions immediately draw lines on the canvas, in raster mode they write to the pixelArray. In raster mode, after draw functions are called, the pixelArray is drawn to the canvas.

- The high-level draw functions call either the low-level drawLine or drawTri function. Wireframe and raster edges calls drawLine which either writes directly to screen or rasterizes line to pixel array respectively. Raster faces calls drawLine for procedural lines and drawTri for meshes which rasterizes triangle to pixelArray.

- In wireframe and raster edges, the screen coordinates of vertices are calculated in the higher level draw function and passed to drawLine. In raster faces, the raw object coordinate triangle and its object properties are passed to the lower level drawTri function which does both uv calculation and rasterization.

This was a brief overview of the core pipeline structure, a more detailed deep dive into the rendering pipeline can be found later on in the document.

### Scene Components
<img src="/CS5160-computer-graphics/assets/screenshot.png" style="vertical-align: top; max-height: 100%; height: auto; max-width: min(800px, 100%);">
    
The scene consists of a few categories of objects: the camera, procedural lines, and mesh instances.

There is an arbitrary horizon.z distance, at which the distant meshes are placed. The procedural meshes a generated at a time based offset between the horizon and camera.

The camera, car, horizon, sun, and mountains all remain stationary, while everything else moves around them, creating the illusion that the camera and car are moving. 

#### Camera
Camera has a few properties: position, limits, clipStart, and fov
- Position: self explanatory and discussed both more previously and later in the document
- limits: ymin and ymax, limiting the camera from going to high up or through the floor
- clipStart: the distance from the camera at which objects are permitted to render.
- fov: the divisor for the translation into screen space, which roughly correlates to field of view.

#### Procedural Lines
The ground plane is procedurally generated as vertical and horizontal lines, in a "cheating" manner, that is, they don't really exist in the scene in any meaningful sense.

##### Vertical
- Iterate x from the road edge towards screen edge, incrementing by the distance between the lines. 
  - Get screen location of lines defined as \[{x, 0, camera.z+clip+0.1} {x, 0, horizon.z}] and \[{-x, 0, camera.z+clip+0.1} {-x, 0, horizon.z}]
  - draw lines
  - stop drawing if the point on horizon is beyond screen edge, or backup cap of 50 line max.

##### Horizontal
- Define the right edge of the screen in screen pixels (canvas width in wireframe, simulated screen pixel width in raster)
- Get screenspace coordinates of sizes of road at horizon line
- Draw the horizon line from the left to right of screen at the height indicated by the road sides at horizon.
- Iterate z from horizon towards the camera, offset by time offset and incrementing by the distance between the lines.
  - Get screen location of road edges at z
  - Draw lines to either edge of screen from the road edges.

##### Road
- Iterate z from horizon towards the camera, offset by time offset and incrementing by the road line interval
  - get another point road that is linelength closer to camera and make sure that point is in from of the camera
  - get uv of the line and draw the line.

#### Meshes
Meshes are defined as vertices and faces. With vertices being a list of {x,y,z} vertices relative to object origin and faces are a list of lists of vertex indicies. Faces can be defined with lengths of 2-4 (edge, tri, or quad). 

<div style="display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px;">
  <img src="/CS5160-computer-graphics/assets/cubeMesh.png" style="width: min(100%, 400px); height: auto;">
  <img src="/CS5160-computer-graphics/assets/lightMesh.png" style="width: min(100%, 400px); height: auto;">
</div>

There are a few different categories of meshes:
- Manually written: cube,sign,light,
- Procedural: mountains
- AI: car,cylinder,sun

The cube, sign, and light I manually typed out myself. The mountains are just a single tri each which is procedurally generated with a random width. The sun I initially manually created a 4 sided diamond, I asked gemini to interpolate it, creating the 12 sided approximation of a circle. I also asked gemini to create the car and cylinder meshes from scratch.

#### Instances
Instances are defined with mesh, position, scale, and color.

<img src="/CS5160-computer-graphics/assets/sunInstance.png" style="width: 100%; max-width: 600px; height: auto; min-width: 0;">

We have a few categories of instances:
- On the fly procedurally generated repeating in z: obstacles, signs, and lights
- Precompute procedural: mountains
- Single instance: car, sun

##### Repeating in z
I really fought very hard with the procedural generation of the lights once implementing consistent scale across frames. I just couldn't figure out the correct formula but through trial and error I eventually figured it out. Made even worse by trying to "cull" distant objects to improve performance. I spent a substantial amount of time on this and it increased complexity without a significant improvement in performance so I ended up getting rid of it.

The ultimate problem of course was using the same procedural generation as the horizontal lines, when I could've just created a list of instances that I updated every frame. But I didn't do that because I was so fixated on reusing the horizontal line generation I didn't think of it. Plus deriving procedural generation formulas like that is one of my preferred forms of self inflicted torture.

###### obstacles
Iterates from 0 to numLightMeshes (which is the same as number of obstances)
- Use the same procedural generation as lights (explained in lights section)
- Offset by half the distance between lights
- Use random scale for lights modulo 2 to randomize left or right lane, as well as at a different magnitude to choose between cube or cylinder mesh.
- Create instance and call drawObject

###### lights
Separate loop from obstacles so that in wireframe mode they are properly drawn in z order

Iterates from 0 to numLightMeshes
- Get the "raw" position of the mesh (where all meshes are in the correct order just offset potentially behind the camera).
- Add the meshLimit (the distance between nearest and furthest mesh) to all meshes behind the camera to move them in front while maintaining order
- get the respective scale from the precomputed random list of scales.
- create instance, then drawObject

###### sign
Iteration is essentially identical to horizontal lines, using mesh interval / 4 for the increment.
- Create instance and call drawObject
- What light instancing was before adding random scales

##### Precomputed 
Mountains are in a precomputed array of instances created at page load, with randomized scale and position in x, they are drawn at horizon in z.
- the draw mountains functions loops through the array and calls drawObject on each instance.

##### Single Instances
Instances defined with global variables, draw loop simply calls drawObject on them. 

The car instance position is updated by the control listener. More on controls below.

### Interaction
There are document event listeners that track key state, either triggering the "other" events on keydown or just tracking key state in a list of whats active for movement.

#### Movement
The continous loop tracks timestamp, calls update function, and draws the scene.

The update function both updates the relative offset that simulates the forward movement of the car as well as updating the camera/car position. Camera can move up and down independently. The camera and the car can be moved together in z.

I originally planned on having a limited movement zone which the player could move around within, it didn't work out well with the camera also being fixed to the car. So instead w and d change the speed at which relative offset changes, making the percieved speed of the camera and car change.

#### Other
There are various key presses impacting world state. 
- `123` mode select: select between each mode with the keyboard.
- `z` palette: Switch between different color palettes. See below for more detail on that.
- `x` pixelGrid: draw each pixel with a distinct accent outline to see the grid clearly
- `c` wireframe: when in raster faces mode, draw all triangle edges with the default color as well as the face rasterization.
- `r` reset: Reset world state (car/camera position, palette, car color, offset)

All but car color and reset are also buttons on the screen making the site mobile friendly.

##### Palettes
Colors started out hard coded, eventually I abstracted them out to a dictionary. Then once they were so easy to change I started experimenting with multiple palettes. Eventually I asked gemini to help implement palette switching since it was beyond the assignment and not something I saw benefit in doing myself.

Palette list/credits:
- [Vaporsthetic](https://lospec.com/palette-list/vaporsthetic)
- Original: Using JS named colors
- [Pastel Horizon](https://lospec.com/palette-list/pastel-horizon-plus)
- [Color Palette Studio](https://thecolorpalettestudio.com/blogs/color-palettes/color-palette-vaporwave?srsltid=AU7gw4Ul7iromBw46YIpxC9cuAv40nmr0szK6wxwbC7QcKM9qh9oS23t)
- [Scheme Color](https://www.schemecolor.com/vaporwave.php)

Palette Gallery:
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%,300px),1fr)); gap: 8px; margin-bottom: 1em;">
  <img src="/CS5160-computer-graphics/assets/vaporsthetic.png" style="width: 100%; height: auto;">
  <img src="/CS5160-computer-graphics/assets/original.png" style="width: 100%; height: auto;">
  <img src="/CS5160-computer-graphics/assets/pastel_horizon.png" style="width: 100%; height: auto;">
  <img src="/CS5160-computer-graphics/assets/color_palette_studio.png" style="width: 100%; height: auto;">
  <img src="/CS5160-computer-graphics/assets/scheme_color.png" style="width: 100%; height: auto;">
</div>

## Rendering
<figure style="margin: 0; width: min(100%, 600px);">
  <img src="/CS5160-computer-graphics/assets/render_pipeline_diagram.png" style="width: 100%; max-width: 800px; height: auto; min-width: 0;">
  <figcaption style="font-size: 0.85em; color: #909090;">pipeline function flow diagram</figcaption>
</figure>

There are a few main categories of rendering functions
- main draw loop: draw()
- high level drawers: drawVerticalLines(), drawHorizontalLines(), drawRoadLines(), drawRepeatingMeshes(), drawMountains(), drawObject()
- low level drawers: drawLine, drawQuad, drawTri, setPixel
- helpers: signedArea2DTri, createQuadFromEdge, getUV, getCameraRelativeCoords, getScreenUV

I was a bit sloppy with the coordinate space expected by different functions, it can be confusing. There are 5 coordinate spaces, objectspace, worldspace, cameraspace, uv, and screenspace. 'uv' is the pinhole projections (-1,1) to (1,1) square space, and screenspace is in pixels which is canvas.width x canvas.height in wireframe but 320x200 in raster. Cameraspace and uv only really exist within the getUV function which despite its name actually returns screenspace x,y. The following are categorized by their input space, they either return in same space or have no return space.
worldspace: createQuadFromEdge, drawQuad, drawTri
screenspace: drawLine, setPixel

### Draw loop
As stated previously, the draw loop clears the display, calls the high level draw functions for each object category, then in raster mode draws the pixelArray to the canvas. Clearing the display consists of filling canvas and pixel array with background color. 

The pixelArray is defined as 2d 320x200 array of { color: background, z: Infinity } objects. Draw functions change the color and assign z with the depth from the camera, where z represents a z-buffer, where pixels will only be overwritten if the depth of the new pixel is closer to the camera than the last. Note that color is a JS color (e.g. 'blue' or '#0000ff') from PALETTE object (e.g. 'PALETTE.bg' 'PALETTE.car'). Alpha where objects can be seen through other objects is not supported as triangles are written to the pixelArray and only the nearest pixel remains saved and drawn.

Actually drawing the pixelArray to canvas is done by getting a scale, defined as 5 by default, and shrunk to integer values if the screen is particularly short. The pixelArray is then iterated through drawing each simulated pixel as a scale x scale square on the canvas. It is also centered in x.

### High level drawers
*Lines() functions always call drawLine, repeatingMeshes and drawMountain calls drawObject on each instance. Draw object calls different low level draw functions depending on mode.
  
### Low level drawers
As stated drawObject calls different low level drawers depending on the mode.
- In wireframe and edge mode calls drawLine
- depending on mode drawLine either uses canvas stroke tool or rasterizes lines using setPixel.
- Raster face drawObject calls different things depending on the face.
  - edges: calls createQuadFromEdge then drawQuad
  - quads: calls drawQuad
  - tris: calls drawTri.
  - Everything eventually ends at drawTri, drawQuad simply splits the quad into two tris. That is if quad is [0,1,2,3], drawTri for both [0,1,2] and [2,3,0].
  - drawtri rasterizes the triangle using signed area of screenspace vertices, uses setPixel to write to pixelArray

Setpixel sets that pixel in the pixelarray ONLY if new z-buffer value is closer than the current z-buffer value

#### Line rasterization
As in class, line rasterization takes the slope and increments along the line by that slope setting the pixels (including z-buffer) in the pixelarray.

Increments are done in steps, where the step count is the maximum between dx and dy. So each increment moves dx/steps in x and dy/steps in y.

#### Triangle rasterization
The triangle rasterization process is as follows.
- getuv of vertices
- get the rectangle that bounds the triangle
- perform the signedArea test for each pixel in the rectangle, that is iterate through all pixels:
  - get the barycentric weights (explained below)
  - If the barycentric weights are all the same sign, call set pixel where the depth is the weighted sum using barycentric weights and each vertices z value. 
  
Barycentric weights. For the barycentric weight of a respective edge and point:
- Get the signed area of the triangle made of that edge and point. For the sign to be correct you must preserve the winding order. That is, define the winding order of the triangle, each edge of the triangle must remain the same direction. So if edge is v2->v3 and point is p1, get signed area for v2->v3->p1
- Divide that signed area over the total area of the triangle

The weight used with the depth value of a vertex is that which was calculated using the opposite edge.

### Helpers
#### getuv
getUv does the full transformation pipeline from objectspace->worldspace->cameraspace->uv->screenspace.
- calls getCameraRelativeCoords which does the objectspace->worldspace->cameraspace transformation
- getUv returns null if the point is behind the camera. That is, if its z position in camera space is less than clipStart.
- getUV does the cameraspace->uv transformation
- calls getScreenUV which does the uv->screenspace transformation. 

#### createQuadFromEdge
Several meshes have been defined only as edges. To draw them in face mode they are expanded into a quad.
- Find the normal to the plane defined by the camera view vector (positive z) and the edge vector. 
- Split the edge in half along that normal to create the quad. That is:
  - quad [0,1,2,3] where [0,1] is the original edge vertices minus the normal and [2,3] is the original edge vertices plus the normal

## Misc Technical Details
Cache/local storage to preserve the selected mode inbetween loads.

The triangle rasterization only colors pixels where the center point is strictly within the triangle. This leads to thin triangles no longer being rendered on such a low resolution display starting at a relative near distance. Which is why createQuadFromEdge creates a extremely wide, 1u wide, quad from the edge, otherwise the edge quickly disappears at any significant distance which I considered undesireable. This could be solved with via expansion of the screenspace of thin triangles but was out of scope of what was asked of us for this project.

There are many global variables, typically not explicitly passed. Things explicitly passed are generally those that are modified or represent the object being operated on.

## Application of Class Concepts
The concepts we learned in class that were applied in this project include:
- 3D object representation
- pinhole projection
- z-buffer
- line rasterization
- triangle rasterization (barycentric coordinates, signed area)

### 3D object representation
<div style="display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px;">
  <img src="/CS5160-computer-graphics/assets/cubeMesh.png" style="width: min(100%, 400px); height: auto;">
  <img src="/CS5160-computer-graphics/assets/lightMesh.png" style="width: min(100%, 400px); height: auto;">
  <img src="/CS5160-computer-graphics/assets/sunInstance.png" style="width: min(100%, 400px); height: auto;">
</div>
We discussed representing 3d objects as vertices and faces/edges in object space. Then instances can be created by offsetting the vertices to a position in world space. Which is exactly what my program does.

### Pinhole projection
<figure style="margin: 0; width: min(100%, 600px);">
  <img src="/CS5160-computer-graphics/assets/pinhole_projection.png" style="width: 100%; max-width: 800px; height: auto; min-width: 0;">
  <figcaption style="font-size: 0.85em; color: #909090;">from our class slides</figcaption>
</figure>

In class we discussed projecting objects in a scene onto the screen via a pinhole camera model. In the diagram you can see that the two triangles are similar. If you let x,y,z be relative to camera where z is the view direction of the camera, and let u,v be the screen space coordinates, you can project the object onto the screen with equations u = x/z, v = y/z. Where (u,v) is in square (0,0) to (1,1). This is exactly what the getUV function does, it takes an vertex, its object, translates to camera space then performs this described translation, with the uv square being mapped to the actual screen coordinates in pixels.

### Z-buffer
In class we discussed methods of making sure that triangles are drawn in the correct order. One way discussed was by using a z-buffer, which is implemented as part of the pixelArray where every pixel has a color and depth and new pixels are only written if their depth is less than the depth of the pixel already in the buffer.

### Line rasterization
<figure style="margin: 0; width: min(100%, 600px);">
  <img src="/CS5160-computer-graphics/assets/line_rasterization.png" style="width: 100%; max-width: 800px; height: auto; min-width: 0;">
  <figcaption style="font-size: 0.85em; color: #909090;">from our class slides</figcaption>
</figure>
In class we discussed methods for rasterizing lines, in particular we looked at exact code for arguably the most straightforward method, where you incrememnt along the line by moving a fixed distance in one axis and stepping by slope relative to that distance in the other axis. My implementation generalizes this by taking the max between dx and dy and then stepping by dx/steps and dy/steps. At each increment rounding the x,y values and drawing to that pixel.

### Triangle rasterization
<figure style="margin: 0; width: min(100%, 600px);">
  <img src="/CS5160-computer-graphics/assets/triangle_rasterization.png" style="width: 100%; max-width: 800px; height: auto; min-width: 0;">
  <figcaption style="font-size: 0.85em; color: #909090;">from our class slides</figcaption>
</figure>
In class we discussed methods for rasterizing triangles. The method I chose to implement is using the signed barycentric coordinates. Barycentric coordinates represent the relative distance to a triangles vertices. If you use signed area in the calculation of barycentric coordinates, then negative values indicate that a point is outside the triangle. So if all three barycentric coordinates are positive, the point is inside the triangle. Barycentric coordinates are also used to interpolate depth to get the precise depth at that point. Not that the inverse of z must be used since barycentric coordinates are calculated from screen space coordinates, under which z is inverted.

## Future Work
I tried to do some optimizations but had already spent many hours on this project with other things to do. An incomplete list of future improvements is below
- Instead of drawing lines in wireframe mode immediately, save them with a depth so they get drawn in the correct order
- Fix the mixing of {x,y,z} and {u,v,z}. Just name everything {x,y,z} with clear documentation of the space the values are in.
- Similarly split up the pipeline more consistently, it's confusing that drawLine takes screenspace coordinates while drawTri takes object space + object info coordinates and does all the transforms itself.
- pixelGrid memory management. Inconsistent sometime pixel values are changed by assigning a brand new {color,z} object while other times the values of the existing object are modified.
- countless optimizations opportunities (right now raster runs buttery smooth on my mac just as well as wireframe but other devices framerate is a lot lower compared to wireframe)
- unify camera info into a single object (ex. {position, fov, clip, etc})
- abstract more reused things from repeated expressions to variables (i.e. road eges) for readability
- draw ALL edges including procedural ones as tris in raster faces
- render the floor grid as faces in raster faces

## AI Disclosure
The majority of the core rendering pipeline I coded myself, with the help of LLM in-line code complete tools (Zed's built in code complete to be exact). I used antigravity in the agent panel in Zed, primarily using gemini 3.8 flash low, occasionally gemini 3.1 pro low to help with debugging and some of the algorithms I applied that were not fully explained in the course. This was just asking in chat for help where it had access to the code. I mostly did not copy and paste anything, just took the overarching design advice.

The solving of problems and bugs encountered was roughly 50/50 between myself and AI. Generally I tried solving things myself but if I got stuck or the problem itself was hard to identify, AI assisted in identifying the problem and suggesting a solution.

Nothing was copy and pasted without understanding besides some of the html/css modifications to be mobile friendly.

However, a few things were largely done by AI. The html overlays were largely created with help of AI, particularly mobile support. I created the color palettes but the switching was almost entirely done by AI.

As mentioned, the car and cylinder meshes were entirely generated by AI and the sun was interpolated into a closer approximation of a circle by AI.
