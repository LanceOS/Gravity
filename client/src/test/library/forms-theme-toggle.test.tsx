import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import {
  Autocomplete,
  AvatarUpload,
  Button,
  Cascader,
  Checkbox,
  ColorPicker,
  DatePicker,
  DateRangePicker,
  DateTimePicker,
  DenseTextInput,
  FileUploader,
  NumberInput,
  PasswordInput,
  PinInput,
  RadioGroup,
  RangeSlider,
  Rating,
  SearchInput,
  Select,
  Switch,
  TextInput,
  Textarea,
  ThemeToggle,
  TimePicker,
  TransferList,
  TreeSelect,
} from '@library';

function formatDate(value?: Date) {
  if (!value) return 'none';

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateTime(value?: Date) {
  if (!value) return 'none';

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function BasicFormsHarness() {
  const [buttonClicks, setButtonClicks] = useState(0);
  const [estimate, setEstimate] = useState(0);
  const [priority, setPriority] = useState('none');
  const [scope, setScope] = useState('narrow');
  const [enabled, setEnabled] = useState(false);

  return (
    <div>
      <Button variant="primary" onClick={() => setButtonClicks((count) => count + 1)}>
        Save draft
      </Button>
      <div>Button clicks: {buttonClicks}</div>

      <TextInput label="Project name" error="Required" defaultValue="Gravity" />
      <Textarea label="Notes" error="Too short" defaultValue="Initial note" />
      <PasswordInput label="Workspace password" defaultValue="secret" />
      <NumberInput label="Estimate" defaultValue="3" onNumberChange={setEstimate} />
      <div>Estimate value: {estimate}</div>

      <SearchInput label="Search tickets" defaultValue="onboarding" />
      <Select
        label="Priority"
        placeholder="Choose priority"
        value={priority === 'none' ? '' : priority}
        onValueChange={(value) => setPriority(value || 'none')}
        options={[
          { value: 'low', label: 'Low' },
          { value: 'high', label: 'High' },
        ]}
      />
      <div>Priority value: {priority}</div>

      <Checkbox label="Send updates" defaultChecked />
      <RadioGroup
        label="Scope"
        name="scope"
        value={scope}
        onChange={setScope}
        options={[
          { value: 'narrow', label: 'Narrow' },
          { value: 'broad', label: 'Broad' },
        ]}
      />
      <div>Scope value: {scope}</div>

      <Switch label="Enabled" checked={enabled} onCheckedChange={setEnabled} />
      <div>Switch value: {String(enabled)}</div>

      <DenseTextInput label="Dense label" defaultValue="dense" />
    </div>
  );
}

function AdvancedSelectorsHarness() {
  const [assignee, setAssignee] = useState('');
  const [path, setPath] = useState<string[]>([]);
  const [node, setNode] = useState('');
  const [leftItems, setLeftItems] = useState(['One', 'Two']);
  const [rightItems, setRightItems] = useState(['Three']);
  const [color, setColor] = useState('#aa3bff');
  const [rating, setRating] = useState(2);
  const [range, setRange] = useState<[number, number]>([20, 80]);

  return (
    <div>
      <Autocomplete
        label="Assignee"
        value={assignee}
        onValueChange={setAssignee}
        options={[
          { value: 'alex', label: 'Alex' },
          { value: 'bea', label: 'Bea' },
          { value: 'cory', label: 'Cory' },
        ]}
        placeholder="Select assignee"
      />
      <div>Autocomplete value: {assignee || 'none'}</div>

      <Cascader
        label="Team path"
        value={path}
        onChange={setPath}
        options={[
          {
            value: 'engineering',
            label: 'Engineering',
            children: [{ value: 'frontend', label: 'Frontend' }],
          },
        ]}
      />
      <div>Cascader value: {path.join('/') || 'none'}</div>

      <div data-testid="tree-select-host">
        <TreeSelect
          label="Primary node"
          value={node}
          onChange={setNode}
          nodes={[
            {
              value: 'design',
              label: 'Design',
              children: [{ value: 'ui', label: 'UI' }],
            },
          ]}
        />
      </div>
      <div>Tree value: {node || 'none'}</div>

      <TransferList
        label="Move items"
        leftItems={leftItems}
        rightItems={rightItems}
        onChange={(nextLeft, nextRight) => {
          setLeftItems(nextLeft);
          setRightItems(nextRight);
        }}
      />
      <div>Transfer right: {rightItems.join(',')}</div>

      <div data-testid="color-picker-host">
        <ColorPicker label="Accent" value={color} onChange={setColor} />
      </div>
      <div>Color value: {color}</div>

      <Rating label="Priority rating" value={rating} onChange={setRating} />
      <div>Rating value: {rating}</div>

      <div data-testid="range-slider-host">
        <RangeSlider label="Effort" min={0} max={100} value={range} onChange={setRange} />
      </div>
      <div>Range value: {range[0]}-{range[1]}</div>
    </div>
  );
}

function ScheduleAndUploadsHarness() {
  const [pin, setPin] = useState('');
  const [pickedDate, setPickedDate] = useState<Date | undefined>(new Date(2024, 0, 10));
  const [pickedTime, setPickedTime] = useState('09:00');
  const [pickedDateTime, setPickedDateTime] = useState<Date | undefined>(new Date(2024, 0, 10, 9, 0));
  const [dateRange, setDateRange] = useState<[Date | undefined, Date | undefined]>([undefined, undefined]);
  const [files, setFiles] = useState<string[]>([]);
  const [avatarFile, setAvatarFile] = useState('none');

  return (
    <div>
      <PinInput label="PIN" value={pin} onChange={setPin} />
      <div>Pin value: {pin || 'none'}</div>

      <div data-testid="date-picker-host">
        <DatePicker label="Due date" value={pickedDate} onChange={setPickedDate} />
      </div>
      <div>Date value: {formatDate(pickedDate)}</div>

      <div data-testid="time-picker-host">
        <TimePicker label="Reminder time" value={pickedTime} onChange={setPickedTime} />
      </div>
      <div>Time value: {pickedTime}</div>

      <div data-testid="date-time-picker-host">
        <DateTimePicker label="Review at" value={pickedDateTime} onChange={setPickedDateTime} />
      </div>
      <div>DateTime value: {formatDateTime(pickedDateTime)}</div>

      <div data-testid="date-range-picker-host">
        <DateRangePicker label="Sprint range" value={dateRange} onChange={setDateRange} />
      </div>
      <div>
        DateRange value: {formatDate(dateRange[0])}|{formatDate(dateRange[1])}
      </div>

      <div data-testid="file-uploader-host">
        <FileUploader label="Attachments" onFileSelect={(selectedFiles) => setFiles(Array.from(selectedFiles).map((file) => file.name))} />
      </div>
      <div>Files value: {files.join(',') || 'none'}</div>

      <div data-testid="avatar-upload-host">
        <AvatarUpload label="Avatar" onChange={(file) => setAvatarFile(file.name)} />
      </div>
      <div>Avatar value: {avatarFile}</div>
    </div>
  );
}

describe('library forms and theme toggle', () => {
  it('renders and updates the basic form controls', async () => {
    const user = userEvent.setup();

    render(<BasicFormsHarness />);

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(screen.getByText('Button clicks: 1')).toBeInTheDocument();

    const projectNameInput = screen.getByLabelText('Project name');
    expect(projectNameInput).toHaveValue('Gravity');
    expect(projectNameInput).toHaveClass('input');
    expect(projectNameInput).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Required')).toHaveClass('lib-field-error-msg');
    expect(screen.getByText('Too short')).toBeInTheDocument();
    expect(screen.getByLabelText('Notes')).toHaveValue('Initial note');
    expect(screen.getByLabelText('Search tickets')).toHaveValue('onboarding');
    const denseInput = screen.getByLabelText('Dense label');
    expect(denseInput).toHaveValue('dense');
    expect(denseInput).toHaveClass('input', 'input--dense');

    const passwordInput = screen.getByLabelText('Workspace password');
    expect(passwordInput).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(passwordInput).toHaveAttribute('type', 'text');

    await user.clear(screen.getByLabelText('Estimate'));
    await user.type(screen.getByLabelText('Estimate'), '8');
    expect(screen.getByText('Estimate value: 8')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Priority' }));
    await user.click(screen.getByRole('option', { name: 'High' }));
    expect(screen.getByText('Priority value: high')).toBeInTheDocument();

    const checkbox = screen.getByLabelText('Send updates');
    expect(checkbox).toBeChecked();
    await user.click(screen.getByLabelText('Broad'));
    expect(screen.getByText('Scope value: broad')).toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: 'Enabled' }));
    expect(screen.getByText('Switch value: true')).toBeInTheDocument();
  });

  it('covers the advanced selectors and sliders', async () => {
    const user = userEvent.setup();

    render(<AdvancedSelectorsHarness />);

    const assigneeInput = screen.getByLabelText('Assignee');
    await user.click(assigneeInput);
    await user.type(assigneeInput, 'be');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByText('Autocomplete value: bea')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Select path/ }));
    await user.click(screen.getByText('Engineering'));
    await user.click(screen.getByText('Frontend'));
    expect(screen.getByText('Cascader value: engineering/frontend')).toBeInTheDocument();

    const treeSelectHost = screen.getByTestId('tree-select-host');
    await user.click(within(treeSelectHost).getByRole('button', { name: /Select node/ }));
    await user.click(within(treeSelectHost).getByRole('button', { name: '▶' }));
    await user.click(within(treeSelectHost).getByText('UI'));
    expect(screen.getByText('Tree value: ui')).toBeInTheDocument();

    await user.click(screen.getByLabelText('One'));
    await user.click(screen.getByRole('button', { name: '>' }));
    expect(screen.getByText('Transfer right: Three,One')).toBeInTheDocument();

    const colorPickerHost = screen.getByTestId('color-picker-host');
    await user.click(within(colorPickerHost).getByRole('button', { name: /Select color/ }));
    await user.click(within(colorPickerHost).getAllByRole('button')[2]);
    expect(screen.getByText('Color value: #7c3aed')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rate 4 out of 5' }));
    expect(screen.getByText('Rating value: 4')).toBeInTheDocument();

    const rangeSliderHost = screen.getByTestId('range-slider-host');
    const track = Array.from(rangeSliderHost.querySelectorAll('div')).find((element) => (element as HTMLDivElement).style.height === '6px') as HTMLDivElement | undefined;
    const thumbs = rangeSliderHost.querySelectorAll('.clickable');

    expect(track).toBeTruthy();
    expect(thumbs).toHaveLength(2);

    Object.defineProperty(track!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ x: 0, y: 0, width: 100, height: 6, top: 0, left: 0, right: 100, bottom: 6, toJSON: () => ({}) }),
    });

    fireEvent.mouseDown(thumbs[0], { clientX: 20 });
    fireEvent.mouseMove(document, { clientX: 40 });
    fireEvent.mouseUp(document);

    expect(screen.getByText('Range value: 40-80')).toBeInTheDocument();
  });

  it('handles scheduling controls and file uploads', async () => {
    const user = userEvent.setup();

    render(<ScheduleAndUploadsHarness />);

    const pinInputs = screen.getAllByRole('textbox');
    await user.type(pinInputs[0], '1');
    await user.type(pinInputs[1], '2');
    await user.type(pinInputs[2], '3');
    await user.type(pinInputs[3], '4');
    expect(screen.getByText('Pin value: 1234')).toBeInTheDocument();

    const datePickerHost = screen.getByTestId('date-picker-host');
    await user.click(within(datePickerHost).getByRole('button', { name: /1\/10\/2024|10\/1\/2024|Jan/ }));
    await user.click(within(datePickerHost).getByRole('button', { name: '15' }));
    expect(screen.getByText('Date value: 2024-01-15')).toBeInTheDocument();

    const timePickerHost = screen.getByTestId('time-picker-host');
    await user.click(within(timePickerHost).getByRole('button', { name: /09:00/ }));
    await user.click(within(timePickerHost).getByText('13:30'));
    expect(screen.getByText('Time value: 13:30')).toBeInTheDocument();

    const dateTimePickerHost = screen.getByTestId('date-time-picker-host');
    const dateTimeButtons = within(dateTimePickerHost).getAllByRole('button');
    await user.click(dateTimeButtons[0]);
    await user.click(within(dateTimePickerHost).getByRole('button', { name: '20' }));
    await user.click(dateTimeButtons[1]);
    await user.click(within(dateTimePickerHost).getByText('14:30'));
    expect(screen.getByText('DateTime value: 2024-01-20T14:30')).toBeInTheDocument();

    const dateRangePickerHost = screen.getByTestId('date-range-picker-host');
    await user.click(within(dateRangePickerHost).getByRole('button', { name: /Select date range/ }));
    await user.click(within(dateRangePickerHost).getByRole('button', { name: '5' }));
    await user.click(within(dateRangePickerHost).getByRole('button', { name: '7' }));
    expect(screen.getByText(/DateRange value: \d{4}-\d{2}-05\|\d{4}-\d{2}-07/)).toBeInTheDocument();

    const attachment = new File(['brief'], 'brief.txt', { type: 'text/plain' });
    const avatar = new File(['avatar'], 'avatar.png', { type: 'image/png' });

    const fileUploaderHost = screen.getByTestId('file-uploader-host');
    const uploadInput = fileUploaderHost.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(uploadInput, attachment);
    expect(screen.getByText('Files value: brief.txt')).toBeInTheDocument();

    const avatarUploadHost = screen.getByTestId('avatar-upload-host');
    const avatarInput = avatarUploadHost.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(avatarInput, avatar);
    expect(screen.getByText('Avatar value: avatar.png')).toBeInTheDocument();
  });

  it('cycles and persists theme selection', async () => {
    const user = userEvent.setup();

    window.localStorage.removeItem('gravity_theme');
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.removeProperty('--color-surface-elevated');
    document.documentElement.style.removeProperty('--color-overlay-scrim');

    render(<ThemeToggle />);

    const toggle = screen.getByRole('button');
    expect(toggle).toHaveAttribute('title', 'Theme: system');
    expect(document.documentElement).toHaveAttribute('data-theme', 'marble-blue');
    expect(document.documentElement.style.getPropertyValue('--color-surface-elevated')).toBe('rgba(255, 255, 255, 0.95)');
    expect(document.documentElement.style.getPropertyValue('--color-overlay-scrim')).toBe('rgba(15, 23, 42, 0.7)');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('title', 'Theme: marble-blue');
    expect(document.documentElement).toHaveAttribute('data-theme', 'marble-blue');
    expect(window.localStorage.getItem('gravity_theme')).toBe('marble-blue');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('title', 'Theme: dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement.style.getPropertyValue('--color-surface-elevated')).toBe('rgba(44, 44, 46, 0.9)');
    expect(document.documentElement.style.getPropertyValue('--color-overlay-scrim')).toBe('rgba(9, 9, 11, 0.7)');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('title', 'Theme: coal-black');
    expect(document.documentElement).toHaveAttribute('data-theme', 'coal-black');
    expect(window.localStorage.getItem('gravity_theme')).toBe('coal-black');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('title', 'Theme: coffee');
    expect(document.documentElement).toHaveAttribute('data-theme', 'coffee');
    expect(window.localStorage.getItem('gravity_theme')).toBe('coffee');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('title', 'Theme: midnight-azure');
    expect(document.documentElement).toHaveAttribute('data-theme', 'midnight-azure');
    expect(window.localStorage.getItem('gravity_theme')).toBe('midnight-azure');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('title', 'Theme: system');
    expect(window.localStorage.getItem('gravity_theme')).toBe('system');
  });
});
