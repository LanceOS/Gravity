import type {
  ChangeEvent,
  FormHTMLAttributes,
  FormEventHandler,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
} from 'react';
import './FormSection.css';

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

type FormSectionRootElement = 'div' | 'form' | 'section';
type FormSectionLayout = 'stack' | 'grid' | 'inline' | 'none';

interface FormSectionRootBaseProps {
  children: ReactNode;
  layout?: FormSectionLayout;
}

type FormSectionRootFormProps = FormSectionRootBaseProps &
  Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> & {
    as?: 'form';
    onSubmit?: FormEventHandler<HTMLFormElement>;
  };

type FormSectionRootDivProps = FormSectionRootBaseProps &
  HTMLAttributes<HTMLDivElement> & {
    as: 'div';
  };

type FormSectionRootSectionProps = FormSectionRootBaseProps &
  HTMLAttributes<HTMLElement> & {
    as: 'section';
  };

export type FormSectionRootProps =
  | FormSectionRootFormProps
  | FormSectionRootDivProps
  | FormSectionRootSectionProps;

interface FormSectionRootSharedProps {
  as: FormSectionRootElement;
  children: ReactNode;
  className?: string;
  layout: FormSectionLayout;
  onSubmit?: FormEventHandler<HTMLFormElement>;
}

function FormSectionRoot(props: FormSectionRootProps) {
  const {
    as: Element = 'form',
    children,
    className,
    layout = 'stack',
    onSubmit,
    ...restProps
  } = props as FormSectionRootSharedProps & Record<string, unknown>;
  const rootClassName = cn('form-section', layout !== 'none' && `form-section--${layout}`, className);

  if (Element === 'form') {
    return (
      <form
        className={rootClassName}
        onSubmit={onSubmit}
        {...(restProps as Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit'>)}
      >
        {children}
      </form>
    );
  }

  if (Element === 'section') {
    return (
      <section className={rootClassName} {...(restProps as HTMLAttributes<HTMLElement>)}>
        {children}
      </section>
    );
  }

  return (
    <div className={rootClassName} {...(restProps as HTMLAttributes<HTMLDivElement>)}>
      {children}
    </div>
  );
}

export interface FormSectionHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  children?: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  title?: ReactNode;
}

function FormSectionHeader({
  children,
  className,
  description,
  eyebrow,
  title,
  ...props
}: FormSectionHeaderProps) {
  return (
    <div className={cn('form-section__header', className)} {...props}>
      <div>
        {eyebrow ? <div className="form-section__eyebrow">{eyebrow}</div> : null}
        {title ? <h3 className="form-section__title">{title}</h3> : null}
      </div>
      {description ? <p className="form-section__description">{description}</p> : null}
      {children}
    </div>
  );
}

export interface FormSectionBodyProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

function FormSectionBody({ children, className, ...props }: FormSectionBodyProps) {
  return <div className={cn('form-section__body', className)} {...props}>{children}</div>;
}

export interface FormSectionGridProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  columns?: 'auto' | 'single' | 'split';
}

function FormSectionGrid({ children, className, columns = 'auto', ...props }: FormSectionGridProps) {
  return (
    <div className={cn('form-section__grid', `form-section__grid--${columns}`, className)} {...props}>
      {children}
    </div>
  );
}

export interface FormSectionFieldProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children: ReactNode;
  label?: ReactNode;
  labelClassName?: string;
}

function FormSectionField({ children, className, label, labelClassName, ...props }: FormSectionFieldProps) {
  return (
    <label className={cn('form-section__field', className)} {...props}>
      {label ? <span className={cn('form-section__label', labelClassName)}>{label}</span> : null}
      {children}
    </label>
  );
}

export interface FormSectionColorFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type'> {
  inputClassName?: string;
  label: ReactNode;
  labelClassName?: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  value: string;
}

function FormSectionColorField({
  className,
  inputClassName,
  label,
  labelClassName,
  onChange,
  value,
  ...props
}: FormSectionColorFieldProps) {
  return (
    <FormSectionField className={className} label={label} labelClassName={labelClassName}>
      <input
        {...props}
        type="color"
        className={cn('form-section__color-input', inputClassName)}
        value={value}
        onChange={onChange}
      />
    </FormSectionField>
  );
}

export interface FormSectionActionsProps extends HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'end' | 'between';
  children: ReactNode;
}

function FormSectionActions({ align = 'start', children, className, ...props }: FormSectionActionsProps) {
  return (
    <div className={cn('form-section__actions', `form-section__actions--${align}`, className)} {...props}>
      {children}
    </div>
  );
}

export interface FormSectionFeedbackProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  type: 'success' | 'error' | 'warning' | 'info';
}

function FormSectionFeedback({ children, className, type, ...props }: FormSectionFeedbackProps) {
  return (
    <div className={cn('form-section__feedback', `form-section__feedback--${type}`, className)} role="alert" {...props}>
      {children}
    </div>
  );
}

export const FormSection = {
  Actions: FormSectionActions,
  Body: FormSectionBody,
  ColorField: FormSectionColorField,
  Feedback: FormSectionFeedback,
  Field: FormSectionField,
  Grid: FormSectionGrid,
  Header: FormSectionHeader,
  Root: FormSectionRoot,
};
