import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Input,
  booleanAttribute,
  Output,
  EventEmitter,
  DestroyRef,
} from "@angular/core";
import "../../elements/my-button.js";

import { MyButton as MyButtonElement } from "../../elements/my-button.js";
export type { MyButtonElement };

/** Custom event with its target typed as `MyButtonElement` */
export type MyButtonElementEvent<E extends Event = CustomEvent> = E & {
  target: MyButtonElement;
};
/** `my-click` event type */
export type MyButtonMyClickElementEvent = MyButtonElementEvent<
  CustomEvent<{ count: number }>
>;
/** `change` event type */
export type MyButtonChangeElementEvent = MyButtonElementEvent<Event>;

/**
 * A demo button used to exercise the generated Angular wrappers.
 *
 * ## Attributes & Properties
 *
 * Component attributes and properties that can be applied to the element or by using JavaScript.
 *
 * - `variant`: The visual variant.
 *   - Type: `"primary" | "secondary"`
 * - `disabled`: Disables the button.
 *   - Type: `boolean`
 * - `value`: The most recent status text. (property only)
 *   - Type: `string`
 *
 * ## Events
 *
 * Events that will be emitted by the component.
 *
 * - `my-click`: Fires when the button is clicked.
 *   - Type: `CustomEvent<{count: number}>`
 * - `change`: Fires when the value changes.
 *   - Type: `Event`
 *
 * ## Slots
 *
 * Areas where markup can be added to the component.
 *
 * - `(default)`: The button label.
 */
@Component({
  selector: "my-button",
  standalone: true,
  template: "<ng-content></ng-content>",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyButton {
  private readonly elementRef = inject<ElementRef<MyButtonElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  /** Fires when the button is clicked. */
  @Output() readonly myClick = new EventEmitter<MyButtonMyClickElementEvent>();

  /** Fires when the value changes. */
  @Output() readonly change = new EventEmitter<MyButtonChangeElementEvent>();

  constructor() {
    const element = this.elementRef.nativeElement;
    const listeners: Array<[string, (event: Event) => void]> = [
      [
        "my-click",
        (event) => this.myClick.emit(event as MyButtonMyClickElementEvent),
      ],
      [
        "change",
        (event) => this.change.emit(event as MyButtonChangeElementEvent),
      ],
    ];

    const cleanup = listeners.map(([type, listener]) => {
      element.addEventListener(type, listener);
      return () => element.removeEventListener(type, listener);
    });

    this.destroyRef.onDestroy(() => {
      cleanup.forEach((remove) => remove());
    });
  }

  /** Disables the button. */
  @Input({ transform: booleanAttribute })
  get disabled(): boolean {
    return this.elementRef.nativeElement.disabled;
  }
  set disabled(value: boolean) {
    this.elementRef.nativeElement.disabled = value;
  }

  /** The visual variant. */
  @Input()
  get variant(): MyButtonElement["variant"] {
    return this.elementRef.nativeElement.variant;
  }
  set variant(value: MyButtonElement["variant"]) {
    this.elementRef.nativeElement.variant = value;
  }

  /** The most recent status text. */
  @Input()
  get value(): MyButtonElement["value"] {
    return this.elementRef.nativeElement.value;
  }
  set value(value: MyButtonElement["value"]) {
    this.elementRef.nativeElement.value = value;
  }
}
