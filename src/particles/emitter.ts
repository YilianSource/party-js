import { Vector } from "../components/vector";
import { settings } from "../settings";
import { getVariationValue } from "../systems/customization";
import { randomInsideRect } from "../systems/random";
import { ParticleModifierModule } from "./modules/particleModifierModule";
import {
    EmissionOptions,
    EmitterOptions,
    RendererOptions,
    ShapeOptions,
    getDefaultEmissionOptions,
    getDefaultEmitterOptions,
    getDefaultRendererOptions,
    getDefaultShapeOptions,
} from "./options";
import { Particle, createParticle } from "./particle";

/**
 * Represents an emitter that is responsible for spawning and updating particles.
 * Particles themselves are just data-holders, with the system acting upon them and
 * modifying them. The modifications are done mainly via modules, that use the
 * particle's data together with some function to apply temporal transitions.
 *
 * @see Particle
 * @see ParticleModifierModule
 */
export class Emitter {
    /**
     * The particles currently contained within the system.
     */
    public readonly particles: Array<Particle> = [];
    /**
     * The array of modules used to modify particles during their lifetime.
     */
    public readonly modules: Array<ParticleModifierModule> = [];

    /**
     * The main options of the emitter.
     */
    public readonly options: EmitterOptions;
    /**
     * The emission options of the emitter.
     */
    public readonly emission: EmissionOptions;
    /**
     * The shape options of the emitter.
     */
    public readonly shape: ShapeOptions;
    /**
     * The renderer options of the emitter.
     */
    public readonly renderer: RendererOptions;

    private durationTimer = 0; // Measures the current runtime duration, to allow loops to reset.
    private emissionTimer = 0; // Measures the current emission timer, to allow spawning particles in intervals.
    private currentLoop = 0; // The current loop index.

    private attemptedBurstIndices: Array<number> = []; // The indices of the particle bursts that were attempted this loop.

    /**
     * Checks if the emitter is already expired and can be removed.
     * Expired emitters are not updated.
     */
    public get isExpired(): boolean {
        // Negative loop counts indicate infinity.
        if (this.options.loops < 0) {
            return false;
        }
        return this.currentLoop >= this.options.loops;
    }

    /**
     * Creates a new emitter, using default options.
     */
    constructor() {
        // TODO: Maybe options can already be passed as partials?
        this.options = getDefaultEmitterOptions();
        this.emission = getDefaultEmissionOptions();
        this.shape = getDefaultShapeOptions();
        this.renderer = getDefaultRendererOptions();
    }

    /**
     * Processes a tick of the emitter, using the elapsed time.
     *
     * @remarks
     * This handles a few things. Namely:
     * - Incrementing the duration timer and potentially incrementing the loop.
     * - Handling particle bursts & emissions.
     * - Despawning particles conditionally.
     *
     * @param delta The time, in seconds, passed since the last tick.
     */
    public tick(delta: number): void {
        // Do not update expired particle systems.
        if (this.isExpired) {
            return;
        }

        this.durationTimer += delta;
        if (this.durationTimer >= this.options.duration) {
            this.currentLoop++;

            if (this.isExpired) {
                return;
            }

            // To start a new loop, the duration timer and attempted bursts are reset.
            this.durationTimer = 0;
            this.attemptedBurstIndices = [];
        }

        // Iterate over the bursts, attempting to execute them if the time is ready.
        let burstIndex = 0;
        for (const burst of this.emission.bursts) {
            if (burst.time <= this.durationTimer) {
                // Has the burst already been attempted? If not ...
                if (!this.attemptedBurstIndices.includes(burstIndex)) {
                    // Perform the burst, emitting a variable amount of particles.
                    const count = getVariationValue(burst.count);
                    for (let i = 0; i < count; i++) {
                        this.emitParticle();
                    }
                    // Mark the burst as attempted.
                    this.attemptedBurstIndices.push(burstIndex);
                }
            }
            burstIndex++;
        }

        // Handle the 'emission over time'. By using a while-loop instead of a simple
        // if-condition, we take high deltas into account, and ensure that the correct
        // number of particles will consistently be emitted.
        this.emissionTimer += delta;
        const delay = 1 / this.emission.rate;
        while (this.emissionTimer > delay) {
            this.emissionTimer -= delay;
            this.emitParticle();
        }

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            this.tickParticle(particle, delta);

            // Particles should be despawned (i.e. removed from the collection) if any of
            // the despawning rules apply to them.
            if (this.options.despawningRules.some((rule) => rule(particle))) {
                this.particles.splice(i, 1);
            }
        }
    }

    /**
     * Performs an internal tick for the particle.
     *
     * @remarks
     * This method controls the particle's lifetime, location and velocity, according
     * to the elapsed delta and the configuration. Additionally, each of the emitter's
     * modules is applied to the particle.
     *
     * @param particle The particle to apply the tick for.
     * @param delta The time, in seconds, passed since the last tick.
     */
    private tickParticle(particle: Particle, delta: number): void {
        particle.lifetime -= delta;

        // Apply gravitational acceleration to the particle.
        particle.velocity = particle.velocity.add(
            Vector.up.scale(settings.gravity * delta)
        );
        // Apply the particle's velocity to its location.
        particle.location = particle.location.add(
            particle.velocity.scale(delta)
        );

        for (const module of this.modules) {
            module.apply(particle);
        }
    }

    /**
     * Emits a particle using the registered settings.
     * Also may despawn a particle if the maximum number of particles is exceeded.
     */
    private emitParticle(): Particle {
        const particle: Particle = createParticle({
            location: randomInsideRect(this.shape.source),
            lifetime: getVariationValue(this.options.initialLifetime),
            velocity: Vector.from2dAngle(
                getVariationValue(this.shape.angle)
            ).scale(getVariationValue(this.options.initialSpeed)),
            size: getVariationValue(this.options.initialSize),
            rotation: getVariationValue(this.options.initialRotation),
            colour: getVariationValue(this.options.initialColour),
        });
        this.particles.push(particle);

        // Ensure that no more particles than 'maxParticles' can exist.
        if (this.particles.length > this.options.maxParticles) {
            this.particles.shift();
        }

        return particle;
    }
}
