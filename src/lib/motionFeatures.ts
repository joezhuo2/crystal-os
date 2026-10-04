/**
 * framer-motion's animation features, in a chunk of their own. Components use
 * the slim `m` component and App's <LazyMotion> loads this after the first
 * render, so none of the animation code sits in the startup bundle.
 *
 * domMax rather than domAnimation: the nav indicator (`layoutId`), the
 * transaction list (`layout`) and the Home grid (`layout="position"`) need
 * layout animations.
 */
import { domMax } from "framer-motion";

export default domMax;
