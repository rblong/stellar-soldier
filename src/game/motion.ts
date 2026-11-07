// Fixed atlas cell metadata, not copied unit behavior. The optional PNG remains local-only.
export const MARINE_COLUMNS=[0,1,2,3,4,5,6,7,8,10,11,12,13,14,15,16];
export const MARINE_DRAW={x:-44,y:-58,size:88,split:26,overlap:2} as const;
export const WALK_CYCLE=108;
export const FOOTSTEP_DISTANCE=WALK_CYCLE/2;
const MUZZLES=[
  [23.4,7.2],[29.92,8.25],[33.8,12.6],[33,17.23],
  [30.22,21.11],[30.47,24.29],[31.21,26.64],[25.21,26.53],
  [20.78,28.67],[17.79,26.53],[11.79,26.64],[12.53,24.29],
  [12.78,21.11],[10,17.23],[9.2,12.6],[13.08,8.25],
];

export function directionFrame(angle:number):number {
  return ((Math.round((angle+Math.PI/2)*8/Math.PI)%16)+16)%16;
}
export function walkFrame(distance:number,moving:boolean):number {
  return moving?Math.floor((distance%WALK_CYCLE)/(WALK_CYCLE/9)):0;
}
/** Same local-space barrel landmark for rendering and projectile origin. */
export function muzzleOffset(angle:number,recoil=0):{x:number;y:number} {
  const [x,y]=MUZZLES[directionFrame(angle)];
  return {x:MARINE_DRAW.x+x*2+Math.cos(angle)*recoil,
          y:MARINE_DRAW.y+y*2+Math.sin(angle)*recoil};
}
export function marineCell(direction:number,row:number):{x:number;y:number} {
  return {x:10+MARINE_COLUMNS[direction]*64,y:10+row*64};
}
