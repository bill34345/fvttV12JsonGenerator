import { ActorGenerator } from '../generator/actor';
import { ItemGenerator } from '../generator/item-generator';
import type { FvttTargetVersion } from '@fvtt-json-generator/generation/target';
import type {
  CanonicalGenerationDocument,
  GenerationProjectionOptions,
  GenerationProjector,
} from './types';

class Dnd5e439Projector implements GenerationProjector {
  public readonly targetVersions = ['12', '13'] as const;
  public readonly systemVersion = '4.3.9' as const;

  public async project(
    document: CanonicalGenerationDocument,
    options: GenerationProjectionOptions,
  ): Promise<unknown> {
    const version = this.resolveVersion(options.targetVersion);
    if (document.kind === 'actor') {
      const generator = new ActorGenerator({
        fvttVersion: version,
        effectProfile: options.effectProfile,
        translationService: options.translationService,
        iconResolver: options.iconResolver,
      });
      return options.route
        ? generator.generateForRoute(document.compatibilitySource, options.route)
        : generator.generate(document.compatibilitySource);
    }
    return new ItemGenerator({
      fvttVersion: version,
      effectProfile: options.effectProfile,
      iconResolver: options.iconResolver,
    })
      .generate(document.compatibilitySource);
  }

  private resolveVersion(requested: FvttTargetVersion): '12' | '13' {
    return requested === '13' ? '13' : '12';
  }
}

class Dnd5e533Projector implements GenerationProjector {
  public readonly targetVersions = ['14'] as const;
  public readonly systemVersion = '5.3.3' as const;

  public async project(
    document: CanonicalGenerationDocument,
    options: GenerationProjectionOptions,
  ): Promise<unknown> {
    if (document.kind === 'actor') {
      const generator = new ActorGenerator({
        fvttVersion: '14',
        effectProfile: options.effectProfile,
        translationService: options.translationService,
        iconResolver: options.iconResolver,
      });
      return options.route
        ? generator.generateForRoute(document.compatibilitySource, options.route)
        : generator.generate(document.compatibilitySource);
    }
    return new ItemGenerator({
      fvttVersion: '14',
      effectProfile: options.effectProfile,
      iconResolver: options.iconResolver,
    })
      .generate(document.compatibilitySource);
  }
}

const DND5E_439_PROJECTOR = new Dnd5e439Projector();
const DND5E_533_PROJECTOR = new Dnd5e533Projector();

export function getGenerationProjector(target: FvttTargetVersion): GenerationProjector {
  return target === '14' ? DND5E_533_PROJECTOR : DND5E_439_PROJECTOR;
}
