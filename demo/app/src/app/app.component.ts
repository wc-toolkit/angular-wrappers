import { Component } from '@angular/core';
import { MyButton } from './wrappers';

@Component({
  selector: 'app-root',
  imports: [MyButton],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  variant: 'primary' | 'secondary' = 'primary';
  isDisabled = false;
  clicks = 0;
  lastValue = '';

  onClick(event: CustomEvent<{ count: number }>) {
    this.clicks = event.detail.count;
  }

  onChange(event: Event) {
    this.lastValue = (event.target as HTMLElement & { value: string }).value;
  }
}
